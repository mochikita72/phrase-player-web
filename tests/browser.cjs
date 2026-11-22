// DOM/media double plus fake-indexeddb for event and persistence tests (not browser QA).
const fs=require('node:fs'), vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const sample=require('../samples/sample-song.json');
class Element{
  constructor(){this.events={};this.children=[];this.dataset={};this.scrollTop=0;this.open=false;this.value='';this.textContent='';this.attributes={};this.classes=new Set();this.classList={toggle:(n,y)=>y?this.classes.add(n):this.classes.delete(n)};}
  addEventListener(n,f){(this.events[n]||=new Set()).add(f);}removeEventListener(n,f){this.events[n]?.delete(f);}
  async fire(n,event={}){for(const f of [...(this.events[n]||[])])await f({target:this,...event});}
  append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}
  setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
  showModal(){this.open=true;}close(){this.open=false;return this.fire('close');}contains(target){return target===this||this.children.some(c=>c.contains?.(target));}
  focus(){}remove(){}click(){return this.fire('click');}scrollIntoView(){}
}
async function app(kind,{factory=new IDBFactory(),search='',storage}={}){
  const blobs=new Map(),revoked=[];let serial=0;
  class Media extends Element{
    constructor(){super();this.currentTime=0;this.duration=NaN;this.paused=true;this.ended=false;}
    set src(v){this._src=v;this.duration=blobs.get(v)?.duration||10;queueMicrotask(()=>this.onloadedmetadata?.());}get src(){return this._src;}
    load(){if(this._src)queueMicrotask(()=>this.fire('canplay'));}
    removeAttribute(k){super.removeAttribute(k);if(k==='src'){this._src='';this.currentTime=0;this.duration=NaN;}}
    pause(){this.paused=true;void this.fire('pause');}play(){this.paused=false;void this.fire('play');return Promise.resolve();}
  }
  const html=fs.readFileSync(`${__dirname}/../${kind}/index.html`,'utf8');
  const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],m[1]==='audio'?new Media():new Element()]));
  const radios=[new Element(),new Element()];radios[0].value='continuous';radios[1].value='segment';
  const document=Object.assign(new Element(),{hidden:false,body:new Element(),getElementById:id=>elements[id],createElement:tag=>tag==='audio'?new Media():new Element(),querySelectorAll:()=>radios,querySelector:()=>new Element()});
  const context=vm.createContext({indexedDB:factory,structuredClone,document,location:{search,href:'',protocol:'http:'},URLSearchParams,window:Object.assign(new Element(),{localStorage:storage,scrollTo(){}}),Blob,URL:{createObjectURL:b=>{const key=`blob:${++serial}`;blobs.set(key,b);return key;},revokeObjectURL:key=>revoked.push(key)},confirm:()=>true,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  for(const file of ['player/common.js','player/library.js','player/sources.js',...(kind==='editor'?['editor/model.js']:[]),`${kind}/${kind}.js`])vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`,'utf8'),context,{filename:file});
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};await settle();
  return {elements,audio:elements.audio,radios,blobs,revoked,document,factory,context,settle,read:code=>vm.runInContext(code,context),async json(data=sample){elements['json-file'].files=[{name:'test.json',text:async()=>JSON.stringify(data)}];await elements['json-file'].fire('change');await settle();},async sound(name='test.wav',duration=10){const file=new Blob(['audio']);file.name=name;file.duration=duration;const input=elements['audio-file']||elements['source-manager'].children.at(-1).children[0];input.files=[file];await input.fire('change');await settle();}};
}
module.exports={app,sample,IDBFactory,Element};
