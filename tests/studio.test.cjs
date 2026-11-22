const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {app,sample}=require('./browser.cjs');
const Model=require('../editor/model.js');
const Phrase=require('../player/common.js');

test('navigation links are outside hidden views and Editor targets the opened song',async()=>{
  const html=fs.readFileSync(`${__dirname}/../player/index.html`,'utf8');
  const nav=html.match(/<nav id="screen-nav" class="screen-nav"[\s\S]*?<\/nav>/)[0];
  assert.match(nav,/<a id="change" href="\?view=library">/);
  assert.match(nav,/<a id="open-editor" href="\.\.\/editor\/">/);
  assert.ok(html.indexOf(nav)<html.indexOf('id="library-view"'));
  assert.ok(!nav.includes('hidden'));
  const editor=await app('editor');await editor.json();await editor.elements.export.click();await editor.settle();
  const player=await app('player',{factory:editor.factory});
  assert.equal(player.elements['open-editor'].href,'../editor/?song='+encodeURIComponent(sample.songId));
  await player.elements.change.click();
  assert.equal(player.elements['library-view'].hidden,false);
  assert.equal(player.elements.player.hidden,true);
  assert.equal(player.elements['open-editor'].href,'../editor/?song='+encodeURIComponent(sample.songId));
});

test('empty song saves, exports and restores without metadata or audio',async()=>{
  const editor=await app('editor');await editor.elements.export.click();await editor.settle();
  assert.equal(editor.read('record.revision'),1);
  const player=await app('player',{factory:editor.factory});
  assert.equal(player.elements.player.hidden,false);
  assert.equal(player.elements['library-view'].hidden,true);
  assert.equal(player.elements.play.disabled,true);
  assert.equal(player.read('phrases.length'),0);
});

test('audio-only song plays, pauses and seeks after save and restore',async()=>{
  const editor=await app('editor');await editor.sound();await editor.elements.export.click();await editor.settle();
  const player=await app('player',{factory:editor.factory});
  assert.equal(player.elements.play.disabled,false);
  assert.equal(player.elements.previous.disabled,true);
  await player.elements.play.click();assert.equal(player.audio.paused,false);
  player.elements.seek.value='4';await player.elements.seek.fire('input');assert.equal(player.audio.currentTime,4);
  await player.elements.play.click();assert.equal(player.audio.paused,true);
});

test('library opens explicitly and deletes only the selected song with its audio',async()=>{
  const editor=await app('editor');await editor.json();await editor.sound();await editor.elements.export.click();await editor.settle();
  const other=structuredClone(sample);other.songId='other';
  const second=await app('editor',{factory:editor.factory});await second.json(other);await second.sound();await second.elements.export.click();await second.settle();
  const library=await app('player',{factory:editor.factory,search:'?view=library'});
  assert.equal(library.elements['library-view'].hidden,false);
  assert.equal(library.elements['song-cards'].children.length,2);
  await library.elements['song-cards'].children[0].children[0].click();await library.settle();
  const removed=library.read('record.id');await library.elements.change.click();await library.settle();
  await library.elements['song-cards'].children[0].children[1].click();await library.settle();
  assert.equal(await library.read(`Library.get(${JSON.stringify(removed)})`),null);
  assert.equal((await library.read('Library.list()')).length,1);
  const remaining=(await library.read('Library.list()'))[0];
  assert.equal((await library.read(`Library.get(${JSON.stringify(remaining.id)})`)).audios.length,1);
});

test('phrase selection plays one second before start and untimed rows remain editable',async()=>{
  const editor=await app('editor');await editor.json();await editor.sound();
  await editor.elements.list.children[2].click();
  assert.equal(editor.read('selected'),sample.sections[0].phrases[1].id);
  assert.equal(editor.audio.currentTime,2);assert.equal(editor.audio.paused,false);
  await editor.elements['add-phrase'].click();const id=editor.read('selected');
  const row=editor.elements.list.children.find(x=>x.attributes['aria-pressed']==='true');
  await row.click();assert.equal(editor.read('selected'),id);assert.equal(editor.elements['phrase-fields'].disabled,false);
});

test('folding changes only presentation; selecting or adding reveals the active section',async()=>{
  const editor=await app('editor');await editor.json();const before=editor.read('JSON.stringify(song)');
  await editor.elements.list.children[0].click();assert.equal(editor.read('collapsed.has(0)'),true);
  assert.equal(editor.read('JSON.stringify(song)'),before);
  await editor.elements['add-phrase'].click();assert.equal(editor.read('collapsed.has(0)'),false);
});

test('boundaries move both directions and across sections without altering flattened data',()=>{
  const song={schemaVersion:1,songId:'s',title:'',artist:'',sections:[0,1,2].map(i=>({name:String(i),phrases:[0,1].map(j=>({id:`${i}-${j}`,text:`line ${i}-${j}`,start:i*2+j}))}))};
  const before=structuredClone(Phrase.flatten(song));
  Model.moveBoundary(song,1,'0-1');assert.deepEqual(song.sections.map(s=>s.phrases.length),[1,3,2]);
  Model.moveBoundary(song,1,'1-1');assert.deepEqual(song.sections.map(s=>s.phrases.length),[3,1,2]);
  Model.moveBoundary(song,2,'0-1');assert.deepEqual(song.sections.map(s=>s.phrases.length),[1,0,5]);
  assert.deepEqual(Phrase.flatten(song),before);Phrase.validate(song);
  assert.throws(()=>Model.moveBoundary(song,0,'0-1'));assert.deepEqual(Phrase.flatten(song),before);
});

test('Editor HTML contains unique IDs and keeps all bulk editing controls inside dialogs',()=>{
  const html=fs.readFileSync(`${__dirname}/../editor/index.html`,'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  assert.equal((html.match(/<dialog /g)||[]).length,4);
  for(const id of ['title','source-manager','bulk','ocr-file','section-name']){
    assert.ok([...html.matchAll(/<dialog\b[\s\S]*?<\/dialog>/g)].some(m=>m[0].includes(`id="${id}"`)),id);
  }
});
