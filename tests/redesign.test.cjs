const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,sample,Element}=require('./browser.cjs');
const clickBack=e=>e.elements['back-player'].fire('click',{preventDefault(){}});
test('Editor navigation follows displayed rows, plays preroll, expands section, and disables endpoints',async()=>{
 const e=await app('editor');await e.json();await e.sound();
 e.read('song.sections.reverse();render();');
 await e.elements.list.children[1].click();const ids=e.read('Phrase.flatten(song).map(p=>p.id)');
 assert.equal(e.read('selected'),ids[0]);assert.equal(e.elements['previous-phrase'].disabled,true);
 await e.elements['next-phrase'].click();assert.equal(e.read('selected'),ids[1]);assert.equal(e.audio.paused,false);
 assert.equal(e.audio.currentTime,e.read('selectionTiming().leadStart'));
 await e.elements['next-phrase'].click();assert.equal(e.read('selected'),ids[2]);assert.equal(e.elements['next-phrase'].disabled,true);
 await e.elements['previous-phrase'].click();assert.equal(e.read('selected'),ids[1]);
});
test('untimed or unavailable audio still permits selection and editing',async()=>{
 const e=await app('editor');await e.json();e.read('song.sections[0].phrases[1].start=null;render();');
 await e.elements.list.children[1].click();await e.elements['next-phrase'].click();
 assert.equal(e.read('selected'),'p002');assert.equal(e.elements['phrase-fields'].disabled,false);assert.equal(e.audio.paused,true);
 assert.equal(e.elements['start-plus'].disabled,true);
});
test('discard saved edits leaves stored song untouched and suppresses duplicate unload prompts',async()=>{
 const e=await app('editor');await e.json();await e.elements.export.click();const before=await e.read('Library.get(record.id)');
 e.elements.title.value='破棄する変更';await e.elements.title.fire('input');e.elements.bulk.value='未追加の歌詞';
 await clickBack(e);assert.equal(e.elements['leave-dialog'].open,true);assert.match(e.elements['leave-description'].textContent,/下書き/);
 await e.elements['leave-cancel'].click();assert.equal(e.read('location.href'),'');assert.equal(e.read('dirty'),true);
 await clickBack(e);await e.elements['leave-discard'].click();assert.match(e.read('location.href'),/song=/);
 assert.deepEqual(await e.read('Library.get(record.id)'),before);let prevented=false;await e.context.window.fire('beforeunload',{preventDefault(){prevented=true;}});assert.equal(prevented,false);
});
test('new draft discard returns library, clean saved song opens without confirmation, OCR drafts prompt',async()=>{
 const e=await app('editor');e.elements.bulk.value='下書き';await clickBack(e);await e.elements['leave-discard'].click();assert.equal(e.read('location.href'),'../player/?view=library');assert.equal((await e.read('Library.list()')).length,0);
 const clean=await app('editor');await clean.json();await clean.elements.export.click();await clickBack(clean);assert.equal(clean.elements['leave-dialog'].open,false);assert.match(clean.read('location.href'),/song=/);
 const o=await app('editor');await o.json();await o.elements.export.click();o.read('window.editorOCR={hasDraft:()=>true}');await clickBack(o);assert.equal(o.elements['leave-dialog'].open,true);assert.equal(o.read('location.href'),'');
});
test('save before leaving separates JSON failure from DB failure, keeps edits and stays in Editor',async()=>{
 const e=await app('editor');await e.json();const create=e.document.createElement;e.document.createElement=tag=>tag==='a'?{click(){throw new Error('JSON失敗');},remove(){}}:create(tag);await clickBack(e);await e.elements['leave-save'].click();
 assert.equal(e.read('location.href'),'');assert.equal(e.read('record.revision'),1);assert.match(e.elements['leave-result'].textContent,/JSON書き出し失敗/);assert.match(e.elements['document-state'].textContent,/保存済み/);
 const d=await app('editor');await d.json();d.read('Library.saveBoth=async()=>({saved:null,jsonStarted:true,message:"端末内保存に失敗・JSON出力開始"})');await clickBack(d);await d.elements['leave-save'].click();assert.equal(d.read('location.href'),'');assert.equal(d.read('dirty'),true);assert.match(d.elements['leave-result'].textContent,/端末内保存に失敗/);
});
test('pending save blocks duplicate save, discard and escape',async()=>{
 const e=await app('editor');await e.json();e.read('Library.saveBoth=()=>new Promise(resolve=>{globalThis.finishSave=resolve;})');await clickBack(e);
 const pending=e.elements['leave-save'].click();await e.settle();assert.equal(e.elements['leave-discard'].disabled,true);
 await e.elements['leave-discard'].click();assert.equal(e.read('location.href'),'');let prevented=false;await e.elements['leave-dialog'].fire('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);
 e.read('finishSave({saved:null,jsonStarted:false,message:"保存失敗"})');await pending;assert.equal(e.elements['leave-discard'].disabled,false);
});
test('responsive view preserves list scroll, selection, collapsed sections and audio at five widths',async()=>{
 for(const width of [1440,1024,768,390,360]){
  const e=await app('editor');await e.json();await e.sound();
  const nodes=e.elements;nodes['editor-workspace'].getBoundingClientRect=()=>({top:200});
  e.document.documentElement={style:{setProperty(){}}};e.document.querySelectorAll=()=>[];
  e.read('window.scrollY=0;window.scrollTo=(x,y)=>{window.scrollY=y};');e.context.window.matchMedia=()=>({matches:width<960});e.context.ResizeObserver=class{observe(){}};
  vm.runInContext(fs.readFileSync(__dirname+'/../editor/layout.js','utf8'),e.context);
  e.read('collapsed.add(1);renderList();window.scrollY=400');const before=e.read('JSON.stringify(song)');
  await nodes.list.children[1].click();assert.equal(nodes['editor-workspace'].dataset.view,'edit');const time=e.audio.currentTime;
  if(width<960)assert.equal(e.read('window.scrollY'),0);
  await nodes['show-list'].click();assert.equal(nodes['editor-workspace'].dataset.view,'list');assert.equal(e.read('window.scrollY'),400);
  assert.equal(e.read('collapsed.has(1)'),true);assert.equal(e.read('JSON.stringify(song)'),before);assert.equal(e.audio.currentTime,time);
 }
});
test('save menu closes on outside pointer and Escape, but not inside clicks',async()=>{
 const e=await app('editor');e.document.querySelectorAll=()=>[];e.document.documentElement={style:{setProperty(){}}};e.elements['editor-workspace'].getBoundingClientRect=()=>({top:200});e.context.window.matchMedia=()=>({matches:true});e.context.ResizeObserver=class{observe(){}};
 const summary=new Element();e.elements['save-menu'].querySelector=()=>summary;
 vm.runInContext(fs.readFileSync(__dirname+'/../editor/layout.js','utf8'),e.context);
 const menu=e.elements['save-menu'];menu.open=true;await e.document.fire('pointerdown',{target:menu});assert.equal(menu.open,true);await e.document.fire('pointerdown',{target:new Element()});assert.equal(menu.open,false);
 menu.open=true;await e.document.fire('keydown',{key:'Escape',preventDefault(){}});assert.equal(menu.open,false);
});

test('typing the first start enables nudges without leaving the field',async()=>{const e=await app('editor');await e.json();e.read('song.sections[0].phrases[0].start=null;render();');await e.elements.list.children[1].click();assert.equal(e.elements['start-plus'].disabled,true);e.elements.start.value='1.5';await e.elements.start.fire('input');assert.equal(e.elements['start-plus'].disabled,false);await e.elements['start-plus'].click();assert.equal(e.read('locationOfSelection().p.start'),1.6);});
