const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,sample}=require('./browser.cjs');

test('opening a saved song always starts with the first displayed source',async()=>{
  const editor=await app('editor');await editor.json();await editor.sound();
  editor.read("record.audios.push({...record.audios[0],id:'last',name:'原曲',offset:2});record.activeAudioId='last';");
  await editor.elements.export.click();
  const player=await app('player',{factory:editor.factory});
  assert.equal(player.read('record.activeAudioId'),player.read('record.audios[0].id'));
  await player.elements['compact-sources'].children[1].click();await player.settle();assert.equal(player.read('record.activeAudioId'),'last');
  const again=await app('player',{factory:editor.factory});assert.equal(again.read('record.activeAudioId'),again.read('record.audios[0].id'));
  assert.equal(again.elements['library-status'].textContent,'');
});

test('Editor separates imported content, local save and backup failure states',async()=>{
  const editor=await app('editor');await editor.json();
  assert.equal(editor.elements['editing-title'].textContent,sample.title);
  assert.match(editor.elements['import-result'].textContent,new RegExp(sample.title));
  assert.match(editor.elements['document-state'].textContent,/未保存の変更/);
  await editor.elements.export.click();assert.match(editor.elements['document-state'].textContent,/保存済み/);
  const restored=await app('editor',{factory:editor.factory,search:'?song='+sample.songId});
  assert.match(restored.elements['document-state'].textContent,/保存済み/);
  restored.elements.title.value='変更した曲';await restored.elements.title.fire('input');
  assert.equal(restored.elements['editing-title'].textContent,'変更した曲');assert.match(restored.elements['document-state'].textContent,/未保存の変更/);
  const create=restored.document.createElement;restored.document.createElement=tag=>tag==='a'?{click(){throw new Error('download failure');},remove(){}}:create(tag);await restored.elements.export.click();
  assert.match(restored.elements['document-state'].textContent,/保存済み/);assert.match(restored.elements['backup-state'].textContent,/JSON書き出し失敗/);
  await restored.json({invalid:true});assert.equal(restored.elements.error.hidden,false);assert.equal(restored.elements['editing-title'].textContent,'変更した曲');
});

test('library ordering survives reload without changing revisions, JSON, audio or last song',async()=>{
  const editor=await app('editor');await editor.json();await editor.sound();await editor.elements.export.click();
  const data=structuredClone(sample);data.songId='zz-second';await editor.json(data);await editor.elements.export.click();
  const before=await editor.read('Library.get("zz-second")'),last=await editor.read('Library.last()');
  const library=await app('player',{factory:editor.factory,search:'?view=library'});
  await library.elements['song-cards'].children[1].children[3].children[0].click();
  const again=await app('player',{factory:editor.factory,search:'?view=library'});
  const rows=await again.read('Library.list()');assert.equal(rows[0].id,'zz-second');
  const after=await again.read('Library.get("zz-second")');assert.deepEqual(after,before);assert.equal(await again.read('Library.last()'),last);
});

test('mobile settings toggle and Escape preserve scrolling and media',async()=>{
  const player=await app('player');await player.json();await player.sound();
  vm.runInContext(fs.readFileSync(__dirname+'/../player/layout.js','utf8'),player.context);
  player.audio.currentTime=4;await player.elements.play.click();
  await player.elements['player-settings-toggle'].click();
  assert.equal(player.elements['player-settings-toggle'].attributes['aria-expanded'],'true');
  assert.equal(player.elements['full-controller'].classes.has('settings-open'),true);
  await player.elements['full-controller'].fire('keydown',{key:'Escape'});
  assert.equal(player.elements['player-settings-toggle'].attributes['aria-expanded'],'false');
  assert.equal(player.audio.currentTime,4);assert.equal(player.audio.paused,false);
  assert.equal(player.elements['compact-player'].hidden,true);
});

test('compact menu supports many sources and mirrors transport and offsets',async()=>{
  const player=await app('player');await player.json();await player.sound();
  player.read("record.audios.push({...record.audios[0],id:'b',offset:1},{...record.audios[0],id:'c',name:'とても長い音源名',offset:2});rebuild();");
  assert.equal(player.elements['compact-sources'].hidden,false);assert.equal(player.elements['compact-sources'].children.length,3);assert.equal(player.elements['compact-source-select'].hidden,true);
  player.read("record.audios.push({...record.audios[0],id:'d'});rebuild();");
  assert.equal(player.elements['source-buttons'].hidden,true);assert.equal(player.elements['source-picker'].hidden,false);assert.equal(player.elements['compact-source-select'].hidden,false);
  player.audio.currentTime=3;await player.elements['compact-play'].click();
  player.elements['compact-source-select'].value='c';await player.elements['compact-source-select'].fire('change');await player.settle();
  assert.equal(player.audio.currentTime,5);assert.equal(player.audio.paused,false);
  await player.elements['compact-play'].click();assert.equal(player.audio.paused,true);
  await player.elements['compact-next'].click();assert.equal(player.audio.paused,false);
});
