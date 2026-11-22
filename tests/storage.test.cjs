const {test}=require('node:test');const assert=require('node:assert/strict');
const {app}=require('./browser.cjs');
const {IDBObjectStore}=require('fake-indexeddb');
test('quota failure rolls back update, reports JSON and storage separately, preserves edits',async()=>{
  const a=await app('editor');await a.json();await a.sound();await a.elements.export.click();
  a.elements.title.value='失敗時も残す編集';await a.elements.title.fire('input');
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='songs')throw new DOMException('full','QuotaExceededError');return original.apply(this,args);};
  try{await a.elements.export.click();}finally{IDBObjectStore.prototype.put=original;}
  assert.match(a.elements.status.textContent,/容量が不足/);assert.match(a.elements.status.textContent,/ダウンロードを開始/);
  assert.equal(a.elements.title.value,'失敗時も残す編集');assert.equal(a.read('dirty'),true);
  const saved=await a.read("Library.get('practice-sample')");assert.notEqual(saved.song.title,'失敗時も残す編集');assert.equal(saved.revision,1);
  assert.equal(await saved.audios[0].file.text(),'audio');
});
test('unavailable IndexedDB keeps file playback and JSON export working',async()=>{
  const a=await app('player');a.context.indexedDB=undefined;await a.json();await a.sound();
  await a.elements.lyrics.children[0].children[1].click();assert.equal(a.audio.paused,false);
  await a.elements['save-library'].click();assert.match(a.elements['library-status'].textContent,/保存が利用できません/);assert.match(a.elements['library-status'].textContent,/ダウンロードを開始/);assert.equal(a.read('dirty'),true);
});
test('duplicate song ID cannot replace an existing record without a matching revision',async()=>{
  const a=await app('editor');await a.json();await a.elements.export.click();
  await assert.rejects(a.read("Library.save({...record,revision:0})"),/同じID/);
  assert.equal((await a.read('Library.list()')).length,1);
});
test('JSON-only update retains all local tracks and blobs when old JSON has no source metadata',async()=>{
  const a=await app('editor');await a.json();await a.sound();
  a.read("record.audios.push({...record.audios[0],id:'second',name:'歌唱',offset:-1});");await a.elements.export.click();
  await a.json();assert.equal(a.read('record.audios.length'),2);assert.equal(a.read('record.audios[1].offset'),-1);await a.elements.export.click();
  const saved=await a.read("Library.get('practice-sample')");assert.equal(saved.audios.length,2);assert.equal(await saved.audios[1].file.text(),'audio');
});
