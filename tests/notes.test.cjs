const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,sample}=require('./browser.cjs');
const notes=p=>p.context.window.PlayerNotes;
test('volume icons expose current mute state without emoji text in Player and Editor',async()=>{
 for(const kind of ['player','editor']){
  const p=await app(kind);await p.json();await p.sound();p.audio.currentTime=4;
  const button=p.elements[kind==='player'?'mute':'editor-mute'];
  assert.equal(button.textContent,'');assert.equal(button.attributes['aria-pressed'],'false');assert.equal(button.classes.has('is-muted'),false);
  await button.click();assert.equal(button.classes.has('is-muted'),true);assert.equal(button.attributes['aria-pressed'],'true');assert.match(button.attributes['aria-label'],/解除/);
  await button.click();assert.equal(button.classes.has('is-muted'),false);assert.equal(p.audio.currentTime,4);assert.equal(p.audio.paused,true);
 }
});
async function saved(){const p=await app('player');await p.json();await p.sound();await p.elements['save-library'].click();return p;}
async function write(p,id,text){notes(p).open(id);p.elements['note-input'].value=text;await p.elements['note-input'].fire('input');await notes(p).flush();await p.settle();}
test('phrase and song notes autosave by stable IDs and survive reload and JSON roundtrip',async()=>{
 const p=await saved();const before=await p.read('Library.get(record.id)');
 await write(p,'p002','息を流す\n語尾を短く');await write(p,null,'次回はサビから');
 assert.equal(notes(p).pending(),false);assert.equal(p.elements['note-state'].textContent,'端末内保存済み');
 const after=await p.read('Library.get(record.id)');assert.deepEqual(after.audios,before.audios);
 assert.equal(after.song.sections[0].phrases[1].id,'p002');assert.equal(after.song.sections[0].phrases[1].note,'息を流す\n語尾を短く');
 const restored=await app('player',{factory:p.factory});assert.equal(restored.read('record.song.note'),'次回はサビから');
 const exported=restored.read('Library.exportSong(record)');const fresh=await app('editor');await fresh.json(exported);
 assert.equal(fresh.read('song.sections[0].phrases[1].note'),'息を流す\n語尾を短く');
 assert.equal(fresh.read('song.note'),'次回はサビから');
});
test('old JSON and conflicting imported notes preserve local notes including intentionally cleared text',async()=>{
 const p=await saved();await write(p,'p001','保護する');await write(p,'p002','');await write(p,null,'曲メモ');
 const editor=await app('editor',{factory:p.factory,search:'?song='+sample.songId});
 await editor.json(sample);assert.equal(editor.read('song.sections[0].phrases[0].note'),'保護する');
 const imported=structuredClone(sample);imported.note='別の曲メモ';imported.sections[0].phrases[0].note='上書き';imported.sections[0].phrases[1].note='削除を取り消す';imported.sections[1].phrases[0].note='新規';
 await editor.json(imported);assert.equal(editor.read('song.note'),'曲メモ');assert.equal(editor.read('song.sections[0].phrases[1].note'),'');assert.equal(editor.read('song.sections[1].phrases[0].note'),'新規');
 await editor.elements.export.click();const rec=await editor.read('Library.get(record.id)');assert.equal(rec.song.sections[0].phrases[0].note,'保護する');
});
test('rapid edits and switching note targets are serialized; errors retain pending input and block navigation',async()=>{
 const p=await saved();notes(p).open('p001');
 for(const text of ['あ','あいう','あいうえお']){p.elements['note-input'].value=text;await p.elements['note-input'].fire('input');}
 notes(p).open('p002');p.elements['note-input'].value='次の行';await p.elements['note-input'].fire('input');await notes(p).flush();
 assert.equal((await p.read('Library.get(record.id)')).song.sections[0].phrases[0].note,'あいうえお');
 p.read("Library.originalSaveNote=Library.saveNote;Library.saveNote=async()=>{throw new Error('quota');};");
 await write(p,'p002','保存待ち');assert.equal(notes(p).pending(),true);assert.match(p.elements['note-state'].textContent,/未保存/);
 assert.equal(p.read('canLeave()'),false);assert.equal(p.elements['note-input'].value,'保存待ち');
 p.read('Library.saveNote=Library.originalSaveNote');await notes(p).flush();assert.equal(notes(p).pending(),false);
});
test('stale note writes cannot overwrite another tab or recreate deleted songs',async()=>{
 const p=await saved(),other=await app('player',{factory:p.factory});await write(other,'p001','別タブ');
 await write(p,'p002','古い画面');assert.equal(notes(p).pending(),true);
 const rec=await p.read('Library.get(record.id)');assert.equal(rec.song.sections[0].phrases[0].note,'別タブ');assert.equal(rec.song.sections[0].phrases[1].note,undefined);
 await other.read('Library.remove(record.id,record.revision)');await notes(p).flush();assert.equal(await p.read('Library.get(record.id)'),null);
});
test('long press suppresses tap playback, movement and cancellation prevent opening, keyboard and context menu work',async()=>{
 const p=await saved(),timers=new Map();let next=0;
 p.context.setTimeout=(fn,ms)=>{assert.equal(ms,500);timers.set(++next,fn);return next;};p.context.clearTimeout=id=>timers.delete(id);
 const row=p.elements.lyrics.children[0].children[2];p.audio.currentTime=4;
 await row.fire('pointerdown',{pointerType:'touch',clientX:10,clientY:10});[...timers.values()][0]();
 assert.equal(p.elements['note-dialog'].open,true);await row.fire('pointerup');await row.click();assert.equal(p.audio.currentTime,4);assert.equal(p.audio.paused,true);
 await p.elements['note-close'].click();
 await row.fire('pointerdown',{pointerType:'touch',clientX:10,clientY:10});await row.fire('pointermove',{clientX:10,clientY:25});assert.equal(timers.size,0);assert.equal(p.elements['note-dialog'].open,false);
 await row.fire('pointerdown',{pointerType:'touch',clientX:0,clientY:0});await row.fire('pointercancel');assert.equal(timers.size,0);
 await row.fire('keydown',{key:'F10',shiftKey:true,preventDefault(){}});assert.equal(p.elements['note-dialog'].open,true);
 await p.elements['note-close'].click();await row.fire('contextmenu',{preventDefault(){}});assert.equal(p.elements['note-dialog'].open,true);assert.equal(p.audio.currentTime,4);
});
test('note viewing and editing preserve audio state; untimed notes remain accessible',async()=>{
 const p=await saved();await p.elements.play.click();p.audio.currentTime=4;
 await write(p,'p002','全文\n二行目');await p.elements['notes-mode'].click();
 assert.equal(p.audio.currentTime,4);assert.equal(p.audio.paused,false);assert.equal(p.read('chosen'),-1);
 assert.equal(p.elements['notes-mode'].attributes['aria-pressed'],'true');assert.equal(p.elements['notes-mode'].textContent,'メモON');assert.equal(p.elements.lyrics.children[0].children[2].children.some(child=>child.className==='memo-mark'),false);assert.equal(p.elements['note-time'].textContent,'0:03');assert.equal(p.elements['note-lyric'].textContent,sample.sections[0].phrases[1].text);assert.equal(p.elements.lyrics.children[0].children[2].memoText.textContent,'全文\n二行目');
 await p.elements['notes-mode'].click();assert.equal(p.elements['notes-mode'].textContent,'メモOFF');assert.equal(p.audio.currentTime,4);assert.equal(p.audio.paused,false);
 p.read('record.song.sections[0].phrases[0].start=null;rebuild();');const row=p.elements.lyrics.children[0].children[1];
 await row.fire('keydown',{key:'ContextMenu',preventDefault(){}});assert.match(p.elements['note-time'].textContent,/時刻未設定/);
});
test('split carries note to first half and merge retains both notes',async()=>{
 const p=await app('editor');await p.json();p.read("song.sections[0].phrases[0].note='元メモ';EditorModel.split(song,0,0,2);");
 assert.equal(p.read('song.sections[0].phrases[0].note'),'元メモ');assert.equal(p.read('song.sections[0].phrases[1].note'),undefined);
 p.read("song.sections[0].phrases[1].note='後半';EditorModel.merge(song,0,0);");assert.equal(p.read('song.sections[0].phrases[0].note'),'元メモ\n後半');
});
test('Editor volume and mute never seek or start playback and survive source switches',async()=>{
 const p=await app('editor');await p.json();await p.sound();p.audio.currentTime=4;
 p.elements['editor-volume'].value='35';await p.elements['editor-volume'].fire('input');assert.equal(p.audio.volume,.35);assert.equal(p.audio.currentTime,4);assert.equal(p.audio.paused,true);
 await p.elements.play.click();await p.elements['editor-mute'].click();assert.equal(p.audio.muted,true);assert.equal(p.audio.paused,false);
 p.read("record.audios.push({...record.audios[0],id:'second'});switchSource('second');");await p.settle();assert.equal(p.audio.volume,.35);assert.equal(p.audio.muted,true);assert.equal(p.audio.currentTime,4);
});
test('header hides for auto follow, ignores programmatic movement and reveals after intentional upward scroll',async()=>{
 const p=await saved();p.context.window.innerHeight=800;p.context.window.scrollY=300;p.context.window.matchMedia=()=>({matches:false});
 p.context.window.scrollTo=()=>{};p.elements['full-controller'].getBoundingClientRect=()=>({top:650});p.document.querySelector=()=>({getBoundingClientRect:()=>({bottom:180})});
 vm.runInContext(fs.readFileSync(__dirname+'/../player/layout.js','utf8'),p.context);
 const row=p.elements.lyrics.children[0].children[1];row.getBoundingClientRect=()=>({top:700,bottom:900,height:200});
 p.context.window.followPlayerPhrase(row,true);assert.equal(p.document.body.classes.has('player-header-hidden'),true);
 p.context.window.scrollY=200;await p.context.window.fire('scroll');assert.equal(p.document.body.classes.has('player-header-hidden'),true);
 await p.context.window.fire('wheel');p.context.window.scrollY=195;await p.context.window.fire('scroll');assert.equal(p.document.body.classes.has('player-header-hidden'),true);
 p.context.window.scrollY=180;await p.context.window.fire('scroll');assert.equal(p.document.body.classes.has('player-header-hidden'),false);
 p.context.window.resumePlayerFollow();p.context.window.followPlayerPhrase(row,true);assert.equal(p.document.body.classes.has('player-header-hidden'),true);
});
