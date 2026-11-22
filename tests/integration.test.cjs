const {test}=require('node:test');const assert=require('node:assert/strict');
const {app,sample}=require('./browser.cjs');
for(const first of ['json','sound'])test(`player reads ${first} first; lead-in, automatic end, seek, modes`,async()=>{
  const a=await app('player');await a[first]();await a[first==='json'?'sound':'json']();
  assert.equal(a.elements.player.hidden,false);assert.equal(a.elements.title.textContent,sample.title);
  const second=a.elements.lyrics.children[0].children[2];await second.click();assert.equal(a.audio.currentTime,2);
  a.audio.currentTime=4;await second.click();assert.equal(a.audio.currentTime,2);
  await a.radios[1].fire('change');assert.equal(a.read('phrases[chosen].end'),6);
  a.audio.currentTime=6.1;await a.audio.fire('timeupdate');assert.equal(a.audio.paused,false);assert.equal(a.audio.currentTime,2);
  await a.elements.next.click();assert.equal(a.audio.currentTime,5);assert.equal(a.read('phrases[chosen].end'),10);
  a.elements.seek.value='1';await a.elements.seek.fire('input');assert.equal(a.read('phrases[chosen].end'),3);
  await a.radios[0].fire('change');assert.equal(a.read('engine.stopAt'),null);
});
test('saved song and audio restore without file selection; editor update returns to player',async()=>{
  const a=await app('player');await a.json();await a.sound();await a.elements['save-library'].click();
  assert.match(a.elements['library-status'].textContent,/未確認/);assert.equal(a.read('dirty'),false);
  const b=await app('player',{factory:a.factory});assert.equal(b.elements.title.textContent,sample.title);assert.equal(b.read('engine.ready'),true);assert.equal(b.audio.paused,true);
  await b.elements.edit.click();assert.match(b.context.location.href,/editor\/\?song=practice-sample/);
  const editor=await app('editor',{factory:a.factory,search:'?song=practice-sample'});
  assert.equal(editor.elements.title.value,sample.title);assert.equal(editor.elements['song-id'].readOnly,true);
  await editor.elements.list.children[1].click();editor.elements.text.value='修正した歌詞';await editor.elements.text.fire('input');
  await editor.elements.export.click();assert.match(editor.elements.status.textContent,/端末内データは更新済み/);assert.equal(editor.read('dirty'),false);
  const exported=[...editor.blobs.values()].filter(b=>b.type==='application/json').at(-1);const json=JSON.parse(await exported.text());
  assert.equal(json.sections[0].phrases[0].text,'修正した歌詞');assert.equal('end' in json.sections[0].phrases[0],false);
  assert.equal(json.sections[0].phrases[0].id,'p001');assert.equal(json.audioSources[0].name,'音源1');
  const c=await app('player',{factory:a.factory});assert.equal(c.read('record.song.sections[0].phrases[0].text'),'修正した歌詞');
});
test('source switch preserves logical position, adds offsets without lead-in, and retains segment end',async()=>{
  const a=await app('player');await a.json();await a.sound();
  a.read("record.audios.push({...record.audios[0],id:'backing',name:'伴奏',offset:2});sources.render()");
  await a.radios[1].fire('change');await a.elements.lyrics.children[0].children[2].click();a.audio.currentTime=4;
  a.elements['source-select'].value='backing';await a.elements['source-select'].fire('change');await a.settle();
  assert.equal(a.audio.currentTime,6);assert.equal(a.audio.paused,false);assert.equal(a.read('phrases[chosen].end'),8);
  await a.elements.lyrics.children[0].children[2].click();assert.equal(a.audio.currentTime,4);assert.equal(a.read('phrases[chosen].end'),8);
  a.elements['source-select'].value='audio-main';await a.elements['source-select'].fire('change');await a.settle();assert.equal(a.audio.currentTime,2);
});
test('start capture subtracts source offset and preview uses next start across sections',async()=>{
  const a=await app('editor');await a.json();await a.sound();a.read('record.audios[0].offset=2;switchSource(record.activeAudioId,true)');await a.settle();
  await a.elements.list.children[2].click();a.audio.currentTime=5.5;await a.elements['stamp-start'].click();assert.equal(a.read('locationOfSelection().p.start'),3.5);
  await a.elements.preview.click();assert.equal(a.audio.currentTime,4.5);assert.equal(a.read('engine.stopAt'),8);
  a.audio.currentTime=1;await a.elements['stamp-start'].click();assert.match(a.elements.error.textContent,/負/);
});
test('JSON-only update retains audio, audio-only replacement retains lyrics; delete clears last',async()=>{
  const a=await app('player');await a.json();await a.sound();await a.elements['save-library'].click();
  await a.json({...sample,title:'更新曲'});assert.equal(a.read('record.audios.length'),1);assert.equal(a.read('record.revision'),1);
  await a.elements['save-library'].click();assert.equal((await a.read('Library.list()')).length,1);
  await a.sound('replacement.mp3');assert.equal(a.read('record.song.title'),'更新曲');await a.elements['save-library'].click();
  const b=await app('player',{factory:a.factory});assert.equal(b.read('record.audios[0].fileName'),'replacement.mp3');assert.equal(b.elements.title.textContent,'更新曲');
  await b.elements['delete-song'].click();const c=await app('player',{factory:a.factory});assert.equal(c.read('record'),null);
});
test('unspecified starts remain visible and saveable, duplicate starts reject, HTML stays text',async()=>{
  const data=structuredClone(sample);data.sections[0].phrases[0].start=null;data.sections[0].phrases[0].text='<img src=x onerror=alert(1)>';
  const a=await app('player');await a.json(data);await a.sound();const row=a.elements.lyrics.children[0].children[1];assert.equal(row.disabled,true);assert.equal(row.children[1].textContent,data.sections[0].phrases[0].text);
  assert.match(a.elements['phrase-note'].textContent,/未設定/);await a.elements['save-library'].click();assert.equal(a.read('record.revision'),1);
  const bad=structuredClone(sample);bad.sections[0].phrases[1].start=0;await a.json(bad);assert.match(a.elements.error.textContent,/重複/);
});
test('editor retains edits when JSON download fails even if IndexedDB succeeds',async()=>{
  const a=await app('editor');await a.json();await a.elements.list.children[1].click();a.elements.text.value='保持する編集';await a.elements.text.fire('input');
  const create=a.document.createElement;a.document.createElement=tag=>tag==='a'?{click(){throw new Error('download blocked');},remove(){}}:create(tag);
  await a.elements.export.click();assert.match(a.elements.status.textContent,/JSON書き出し失敗/);assert.match(a.elements.status.textContent,/端末内データは更新済み/);assert.equal(a.read('dirty'),true);assert.equal(a.read('song.sections[0].phrases[0].text'),'保持する編集');
});
test('two editors cannot silently overwrite each other; download still available on conflict',async()=>{
  const a=await app('editor');await a.json();await a.elements.export.click();
  const b=await app('editor',{factory:a.factory,search:'?song=practice-sample'});
  a.elements.title.value='先に保存';await a.elements.title.fire('input');await a.elements.export.click();
  b.elements.title.value='後の編集';await b.elements.title.fire('input');await b.elements.export.click();
  assert.match(b.elements.status.textContent,/別の画面/);assert.match(b.elements.status.textContent,/ダウンロードを開始/);assert.equal(b.read('dirty'),true);
});
test('source manager edits signed offsets and names, then deletes only one source',async()=>{
  const a=await app('player');await a.json();await a.sound();
  a.read("record.audios.push({...record.audios[0],id:'other',name:'別音源',offset:0});sources.render()");
  let row=a.elements['source-manager'].children[1];row.children[0].children[0].value='自分の歌唱';await row.children[0].children[0].fire('change');
  row=a.elements['source-manager'].children[1];row.children[1].children[0].value='-1.25';await row.children[1].children[0].fire('change');
  assert.equal(a.read('record.audios[1].name'),'自分の歌唱');assert.equal(a.read('record.audios[1].offset'),-1.25);
  await a.elements['save-library'].click();await a.elements['source-manager'].children[0].children[3].click();await a.settle();
  assert.equal(a.read('record.audios.length'),1);assert.equal(a.read('record.activeAudioId'),'other');await a.elements['save-library'].click();
  const b=await app('player',{factory:a.factory});assert.equal(b.read('record.audios.length'),1);assert.equal(b.read('record.audios[0].name'),'自分の歌唱');
});
test('all-unset draft exports and saves, but segment playback gives guidance',async()=>{
  const data=structuredClone(sample);data.sections.forEach(s=>s.phrases.forEach(p=>{p.start=null;}));
  const a=await app('player');await a.json(data);await a.sound();await a.elements['save-library'].click();
  assert.equal(a.read('record.revision'),1);await a.elements.play.click();assert.equal(a.audio.paused,false);
  await a.radios[1].fire('change');assert.equal(a.audio.paused,false);await a.elements.play.click();assert.equal(a.audio.paused,true);await a.elements.play.click();assert.match(a.elements.error.textContent,/開始時刻/);
});
test('editor sorts only on time commit and preserves selected ID/text and automatic end',async()=>{
  const a=await app('editor');await a.json();await a.elements['add-phrase'].click();
  const id=a.read('selected');a.elements.text.value='♪';await a.elements.text.fire('input');
  a.elements.start.value='1.5';await a.elements.start.fire('input');
  assert.equal(a.read('song.sections[0].phrases[2].id'),id);
  await a.elements.start.fire('change');
  assert.equal(a.read('song.sections[0].phrases[1].id'),id);assert.equal(a.read('selected'),id);assert.equal(a.elements.text.value,'♪');assert.equal(a.elements.start.value,1.5);
  assert.equal(a.read('selectionTiming().end'),3);assert.equal(a.read('song.sections[1].phrases[0].id'),'p003');
  a.elements.start.value='4';await a.elements.start.fire('input');await a.elements.start.fire('keydown',{key:'Enter',preventDefault(){}});
  assert.equal(a.read('song.sections[0].phrases[2].id'),id);assert.equal(a.read('selectionTiming().end'),6);
});
test('capturing current time sorts within the section, and cross-section inversion warns',async()=>{
  const a=await app('editor');await a.json();await a.sound();await a.elements.list.children[2].click();
  const id=a.read('selected');a.audio.currentTime=7;await a.elements['stamp-start'].click();
  assert.equal(a.read('selected'),id);assert.equal(a.elements['order-warning'].hidden,false);assert.match(a.elements['order-warning'].textContent,/サビ/);
  a.audio.currentTime=2;await a.elements['stamp-start'].click();assert.equal(a.elements['order-warning'].hidden,true);
  assert.equal(a.elements.up,undefined);assert.equal(a.elements.down,undefined);
});
