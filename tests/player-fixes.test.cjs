const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,Element}=require('./browser.cjs');
test('each loop applies preroll after signed offsets and clamps at zero',async()=>{
 const p=await app('player');await p.json();await p.sound();await p.radios[1].fire('change');
 for(const offset of [0,2,-0.5]){
  p.read(`record.audios[0].offset=${offset};switchSource(record.audios[0].id,true);`);await p.settle();
  await p.elements.lyrics.children[0].children[1].click();
  for(let pass=0;pass<3;pass++){
   p.audio.currentTime=p.read('phrases[chosen].end');await p.audio.fire('timeupdate');
   assert.equal(p.audio.currentTime,Math.max(0,offset-1));assert.equal(p.audio.paused,false);
  }
 }
});
test('seek and pause resume preserve exact position; loops repeat and continuous mode releases them',async()=>{
 const p=await app('player');await p.json();await p.sound();
 await p.radios[1].fire('change');
 p.elements.seek.value='4.2';await p.elements.seek.fire('input');await p.elements.play.click();
 assert.equal(p.audio.currentTime,4.2);
 await p.elements.play.click();await p.elements.play.click();assert.equal(p.audio.currentTime,4.2);
 for(let i=0;i<3;i++){p.audio.currentTime=6.02;await p.audio.fire('timeupdate');assert.equal(p.audio.currentTime,2);assert.equal(p.audio.paused,false);}
 await p.elements.play.click();p.audio.currentTime=6;await p.audio.fire('timeupdate');assert.equal(p.audio.currentTime,6);assert.equal(p.audio.paused,true);
 p.elements.seek.value='7';await p.elements.seek.fire('input');await p.elements.play.click();
 p.audio.currentTime=10;p.audio.paused=true;await p.audio.fire('ended');assert.equal(p.audio.currentTime,5);assert.equal(p.audio.paused,false);
 await p.radios[0].fire('change');p.audio.currentTime=8;await p.audio.fire('timeupdate');assert.equal(p.audio.currentTime,8);
});
test('highlight follows time, never retains manual selection; offset loop uses shifted start',async()=>{
 const p=await app('player');await p.json();await p.sound();await p.elements.lyrics.children[0].children[1].click();
 p.audio.currentTime=4;await p.audio.fire('timeupdate');
 assert.equal(p.read('buttons[0].classes.has("active")'),false);assert.equal(p.read('buttons[0].classes.has("selected")'),false);assert.equal(p.read('buttons[1].classes.has("active")'),true);
 await p.radios[1].fire('change');p.read("record.audios.push({...record.audios[0],id:'offset',offset:2});switchSource('offset');");await p.settle();
 assert.equal(p.audio.currentTime,6);p.audio.currentTime=8.01;await p.audio.fire('timeupdate');assert.equal(p.audio.currentTime,4);
});
test('following scrolls only on phrase changes; manual scroll suspends until explicit resume',async()=>{
 const p=await app('player');await p.json();await p.sound();const moves=[];
 p.context.window.innerHeight=800;p.context.window.scrollY=0;p.context.window.matchMedia=()=>({matches:false});p.context.window.scrollTo=value=>moves.push(value);
 p.elements['full-controller'].getBoundingClientRect=()=>({top:650});
 p.document.querySelector=()=>({getBoundingClientRect:()=>({bottom:100})});
 vm.runInContext(fs.readFileSync(__dirname+'/../player/layout.js','utf8'),p.context);
 const row=new Element();row.getBoundingClientRect=()=>({top:700,bottom:750,height:50});
 p.context.window.followPlayerPhrase(row,true);p.context.window.followPlayerPhrase(row,true);assert.equal(moves.length,1);
 await p.context.window.fire('wheel');p.context.window.followPlayerPhrase(new Element(),true);assert.equal(moves.length,1);assert.equal(p.elements['resume-follow'].hidden,false);
 p.context.window.resumePlayerFollow();p.context.window.followPlayerPhrase(row,true);assert.equal(moves.length,2);assert.equal(p.elements['resume-follow'].hidden,true);
});
