const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(recognize = async () => ({data:{text:'朝 の ひかり\n歌いましょう\nHello world'}})) {
  class Element {
    constructor(){this.value='';this.events={};this.hidden=false;}
    addEventListener(name, fn){this.events[name]=fn;}
    setAttribute(){} focus(){} dispatchEvent(){}
    async fire(name,event={}){return this.events[name]?.({target:this,...event});}
  }
  const ids = [...fs.readFileSync(`${__dirname}/../editor/index.html`,'utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements = Object.fromEntries(ids.map(id=>[id,new Element()]));
  const document = Object.assign(new Element(),{baseURI:'http://localhost:4173/editor/',getElementById:id=>elements[id]});
  let terminated=0, options;
  class TestURL extends URL {static createObjectURL(){return 'blob:test';} static revokeObjectURL(){}}
  const context = {document,window:new Element(),location:{protocol:'http:'},URL:TestURL,Event:class{},Image:class{naturalWidth=800;naturalHeight=600;set src(value){this.onload();}},setTimeout:()=>1,clearTimeout(){},confirm:()=>true,Tesseract:{createWorker:async(languages,oem,opts)=>{assert.equal(languages,'jpn+eng');options=opts;return{recognize,terminate:async()=>{terminated++;}};}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../editor/ocr.js`,'utf8'),context);
  return {elements,context,get options(){return options;},get terminated(){return terminated;},async select(file={type:'image/png',size:100}){elements['ocr-file'].files=[file];await elements['ocr-file'].fire('change');await Promise.resolve();}};
}
test('OCR keeps existing lyrics until explicit append; uses only local assets', async()=>{
  const a=harness();a.elements.bulk.value='既存の歌詞';await a.select();await a.elements['ocr-start'].fire('click');
  assert.equal(a.elements.bulk.value,'既存の歌詞');assert.equal(a.elements['ocr-result'].value,'朝のひかり\n歌いましょう\nHello world');
  for(const name of ['workerPath','corePath','langPath'])assert.ok(a.options[name].startsWith('http://localhost:4173/editor/vendor/'));
  assert.equal(a.options.cacheMethod,'none');assert.equal(a.terminated,1);
  a.elements['ocr-result'].value='修正した歌詞';await a.elements['ocr-append'].fire('click');
  assert.equal(a.elements.bulk.value,'既存の歌詞\n修正した歌詞');assert.equal(a.elements['ocr-result'].value,'');
});
test('clipboard image accepted; normal text paste untouched',async()=>{
  const a=harness();let prevented=false;
  await a.context.document.fire('paste',{clipboardData:{items:[{kind:'string',type:'text/plain'}]},preventDefault(){prevented=true;}});assert.equal(prevented,false);
  await a.context.document.fire('paste',{clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({type:'image/png',size:100})}]},preventDefault(){prevented=true;}});
  await Promise.resolve();assert.equal(prevented,true);assert.equal(a.elements['ocr-start'].disabled,false);
});
test('cancel discards a late recognition result and permits retry',async()=>{
  let resolve;const a=harness(()=>new Promise(r=>resolve=r));await a.select();
  const run=a.elements['ocr-start'].fire('click');for(let i=0;i<5;i++)await Promise.resolve();
  await a.elements['ocr-cancel'].fire('click');resolve({data:{text:'遅れて届いた結果'}});await run;
  assert.equal(a.elements['ocr-result'].value,'');assert.equal(a.elements['ocr-start'].disabled,false);assert.ok(a.terminated>=1);
});
test('OCR failures preserve text and restore controls',async()=>{
  const a=harness(async()=>{throw new Error('読み取り失敗');});await a.select();a.elements['ocr-result'].value='保存したい結果';
  await a.elements['ocr-start'].fire('click');assert.equal(a.elements['ocr-result'].value,'保存したい結果');assert.equal(a.elements['ocr-start'].disabled,false);assert.match(a.elements['ocr-status'].textContent,/失敗/);
});
test('reject unsupported and oversized images, and file protocol',async()=>{
  const a=harness();await a.select({type:'application/pdf',size:100});assert.match(a.elements['ocr-status'].textContent,/PNG/);
  await a.select({type:'image/png',size:30*1024*1024});assert.match(a.elements['ocr-status'].textContent,/20MB/);
  await a.select();a.context.location.protocol='file:';await a.elements['ocr-start'].fire('click');assert.match(a.elements['ocr-status'].textContent,/ローカルサーバー/);
});
