const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {app,sample}=require('./browser.cjs');
test('volume and mute persist across source switches and reloads, with safe fallback',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const player=await app('player',{storage});await player.json();await player.sound();
  player.elements.volume.value='37';await player.elements.volume.fire('input');assert.equal(player.audio.volume,.37);
  await player.elements.mute.click();assert.equal(player.audio.muted,true);assert.match(player.elements['volume-value'].textContent,/ミュート/);
  player.read("record.audios.push({...record.audios[0],id:'other',offset:2});switchSource('other');");await player.settle();assert.equal(player.audio.volume,.37);assert.equal(player.audio.muted,true);
  await player.elements['save-library'].click();const again=await app('player',{factory:player.factory,storage});assert.equal(again.audio.volume,.37);assert.equal(again.audio.muted,true);
  await again.elements.mute.click();assert.equal(again.audio.muted,false);assert.equal(again.audio.volume,.37);
  again.elements.volume.value='0';await again.elements.volume.fire('input');await again.elements.mute.click();assert.equal(again.audio.volume,.37);
  values.set('phrase-studio-volume','invalid');const fresh=await app('player',{storage});assert.equal(fresh.audio.volume,1);assert.equal(fresh.audio.muted,false);
});
test('Editor restore and JSON import select the first source and retain capture offset',async()=>{
  const editor=await app('editor');await editor.json();await editor.sound();editor.read("record.audios[0].offset=1;record.audios.push({...record.audios[0],id:'second',offset:3});record.activeAudioId='second';");await editor.elements.export.click();
  const restored=await app('editor',{factory:editor.factory,search:'?song='+sample.songId});assert.equal(restored.read('record.activeAudioId'),restored.read('record.audios[0].id'));assert.equal(restored.read('currentOffset'),1);
  restored.audio.currentTime=2.4;await restored.elements['stamp-start'].click();assert.equal(restored.read('locationOfSelection().p.start'),1.4);
  await restored.json();assert.equal(restored.read('record.activeAudioId'),restored.read('record.audios[0].id'));
});
test('JSON result is available inside the dialog and summary is separate from local save state',async()=>{
  const editor=await app('editor');await editor.json();assert.match(editor.elements['json-import-result'].textContent,new RegExp(sample.title));assert.equal(editor.elements['song-summary'].textContent,'3フレーズ · 0音源');assert.match(editor.elements['document-state'].textContent,/未保存/);assert.ok(!editor.elements['document-state'].textContent.includes('JSON'));
  assert.match(editor.elements['loaded-song-summary'].textContent,/端末内未保存/);await editor.elements.export.click();assert.match(editor.elements['document-state'].textContent,/保存済み/);assert.match(editor.elements['loaded-song-summary'].textContent,/端末内保存済み/);assert.ok(!editor.elements['json-import-result'].textContent.includes('未保存'));
  const html=fs.readFileSync(__dirname+'/../editor/index.html','utf8');assert.match(html,/<details[^>]*class="phrase-details"[\s\S]*?id="split"/);assert.match(html,/<details id="save-menu"[\s\S]*?id="json-only"/);assert.match(html,/<dialog id="song-dialog"[\s\S]*?id="json-import-result"/);
});
test('Player icons expose action labels, mode controls remain direct, artist is mirrored',async()=>{
  const player=await app('player');await player.json();await player.sound();assert.equal(player.elements['compact-artist'].textContent,sample.artist);assert.equal(player.elements.play.attributes['aria-label'],'再生');await player.elements.play.click();assert.equal(player.elements.play.attributes['aria-label'],'一時停止');assert.equal(player.elements.play.textContent,'⏸');
  const html=fs.readFileSync(__dirname+'/../player/index.html','utf8');assert.ok(!html.includes('class="playback-options"'));assert.match(html,/title="前のフレーズ"/);
  await player.elements['save-library'].click();await player.elements.change.click();await player.settle();const row=player.elements['song-cards'].children[0];assert.equal(row.children[0].children[1].textContent,' – ');assert.equal(row.children[3].children[0].textContent,'↑');assert.equal(row.children[3].children[1].textContent,'↓');
});
