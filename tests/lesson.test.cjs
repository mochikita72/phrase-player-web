const {test}=require('node:test');const assert=require('node:assert/strict');
const {app,sample}=require('./browser.cjs');const M=require('../editor/model.js');const P=require('../player/common.js');const L=require('../player/library.js');

test('section reorder preserves IDs, lyrics and times, saves and calculates chronological intervals',async()=>{
  const editor=await app('editor');await editor.json();
  const original=editor.read('JSON.stringify(song.sections[0])');
  await editor.elements['section-rows'].children[0].children[1].children[1].click();
  assert.equal(editor.read('JSON.stringify(song.sections[1])'),original);
  await editor.elements.export.click();assert.equal(editor.read('dirty'),false);
  const player=await app('player',{factory:editor.factory});await player.sound();
  assert.equal(player.read('record.song.sections[1].name'),sample.sections[0].name);
  assert.equal(player.read('phrases.find(p=>p.id==="p002").end'),6);
  assert.equal(player.read('phrases.find(p=>p.id==="p003").end'),10);
  assert.equal(player.read('phrases.find(p=>p.id==="p001").leadStart'),0);
});

test('deleting populated section transfers every phrase and retains selection',async()=>{
  const editor=await app('editor');await editor.json();await editor.elements.list.children[1].click();
  const id=editor.read('selected');const before=editor.read('JSON.stringify(Phrase.flatten(song))');
  await editor.elements['section-rows'].children[0].children[1].children[2].click();
  assert.equal(editor.elements['section-rows'].children[0].children[2].hidden,false);
  await editor.elements['section-rows'].children[0].children[1].children[2].click();
  assert.equal(editor.read('song.sections.length'),1);assert.equal(editor.read('JSON.stringify(Phrase.flatten(song))'),before);
  assert.equal(editor.read('selected'),id);assert.equal(editor.read('locationOfSelection().s'),0);
  assert.equal(editor.elements['section-rows'].children[0].children[1].children[2].disabled,true);
});

test('section deletion validates destination before mutation and empty sections need no target',()=>{
  const song=structuredClone(sample),before=structuredClone(song);
  assert.throws(()=>M.removeSection(song,0,0));assert.deepEqual(song,before);
  song.sections.push({name:'empty',phrases:[]});M.removeSection(song,2);assert.deepEqual(song,before);
  M.moveSection(song,1,-1);P.validate(song);assert.deepEqual(song.sections[0],before.sections[1]);
});

test('start nudges preserve decimal precision, selection and scroll without downloads',async()=>{
  const editor=await app('editor');await editor.json();await editor.elements.list.children[2].click();
  editor.elements.start.value='3.442123';await editor.elements.start.fire('input');await editor.elements.start.fire('change');
  const id=editor.read('selected'),blobs=editor.blobs.size;
  editor.read('window.scrollY=350;window.scrollTo=(x,y)=>{window.scrollY=y;}');
  await editor.elements['start-plus'].click();assert.equal(editor.read('locationOfSelection().p.start'),3.542123);
  await editor.elements['start-minus'].click();assert.equal(editor.read('locationOfSelection().p.start'),3.442123);
  assert.equal(editor.read('selected'),id);assert.equal(editor.read('window.scrollY'),350);assert.equal(editor.blobs.size,blobs);
  const phrase={start:0.034};M.adjustStart(phrase,-0.1);assert.equal(phrase.start,0);
  const tiny={start:1e-7};M.adjustStart(tiny,0.1);assert.equal(tiny.start,0.1000001);
  assert.throws(()=>M.adjustStart({start:null},0.1));
});

test('source buttons appear for two or three tracks and preserve logical playback position',async()=>{
  const player=await app('player');await player.json();await player.sound();
  assert.equal(player.elements['source-picker'].hidden,true);assert.equal(player.elements['source-buttons'].hidden,true);
  player.read("record.audios.push({...record.audios[0],id:'second',name:'伴奏',offset:2});rebuild();");
  assert.equal(player.elements['source-buttons'].children.length,2);assert.equal(player.elements['source-buttons'].hidden,false);
  player.audio.currentTime=3;await player.elements.play.click();await player.elements['source-buttons'].children[1].click();await player.settle();
  assert.equal(player.audio.currentTime,5);assert.equal(player.audio.paused,false);
  assert.equal(player.elements['source-buttons'].children[1].attributes['aria-pressed'],'true');
  player.read("record.audios.push({...record.audios[0],id:'third'},{...record.audios[0],id:'fourth'});rebuild();");
  assert.equal(player.elements['source-buttons'].hidden,true);assert.equal(player.elements['source-picker'].hidden,false);
});

test('library has explicit edit targets and no header navigation; new Editor saves before Player',async()=>{
  const editor=await app('editor');let prevented=false;editor.elements.title.value='新しい練習曲';await editor.elements.title.fire('input');
  await editor.elements['back-player'].fire('click',{preventDefault(){prevented=true;}});await editor.settle();
  assert.equal(prevented,true);assert.equal(editor.elements['leave-dialog'].open,true);assert.equal(editor.read('record.revision'),0);await editor.elements['leave-save'].click();assert.equal(editor.read('record.revision'),1);
  assert.equal(editor.read('location.href'),editor.elements['back-player'].href);
  const library=await app('player',{factory:editor.factory,search:'?view=library'});
  assert.equal(library.elements['screen-nav'].hidden,true);
  assert.equal(library.elements['song-cards'].children[0].children[2].href,editor.elements['back-player'].href.replace('../player/','../editor/'));
});

test('export names use song title, safe characters and local calendar fields for both flows',async()=>{
  const date=new Date(2026,10,22,10,28,41);
  assert.equal(L.filename('seaside',date),'seaside_20261122_102841.json');
  assert.equal(L.filename(' a/b:c*?<>|"\\. ',date),'a_b_c________20261122_102841.json');
  assert.match(L.filename('',date),/^無題の曲_20261122_102841\.json$/);
  const editor=await app('editor');editor.elements.title.value='lesson';await editor.elements.title.fire('input');
  await editor.elements['json-only'].click();await editor.elements.export.click();
  const downloads=editor.document.body.children.filter(x=>x.download);
  assert.equal(downloads.length,2);for(const a of downloads)assert.match(a.download,/^lesson_\d{8}_\d{6}\.json$/);
});
