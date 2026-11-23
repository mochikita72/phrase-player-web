'use strict';
// One mounted transport: settings never reload audio or scroll lyrics.
const fullController=document.getElementById('full-controller');
const settingsToggle=document.getElementById('player-settings-toggle');
let settingsOpen=false;
function showSettings(open){settingsOpen=open;fullController.classList.toggle('settings-open',open);settingsToggle.setAttribute('aria-expanded',String(open));settingsToggle.textContent=open?'閉じる':'詳細';measureControls();}
settingsToggle.addEventListener('click',()=>showSettings(!settingsOpen));
fullController.addEventListener('keydown',event=>{if(event.key==='Escape'&&settingsOpen){showSettings(false);settingsToggle.focus();}});
window.refreshCompactPlayer=()=>{document.getElementById('compact-player').hidden=true;};
window.refreshCompactPlayer();

let followEnabled=true,lastFollowed=null,manualScroll=false,previousY=window.scrollY||0,directionDistance=0,headerHidden=false;
const resumeFollow=document.getElementById('resume-follow');
resumeFollow.textContent='';resumeFollow.title='再生中の歌詞に追従';resumeFollow.setAttribute('aria-label','再生中の歌詞に追従');
function suspendFollow(){followEnabled=false;resumeFollow.hidden=false;}
function header(hidden){
  headerHidden=hidden;document.body.classList.toggle('player-header-hidden',hidden);
  for(const node of [document.getElementById('screen-nav'),document.querySelector('.player-sidebar')])if(node){node.inert=hidden;node.setAttribute?.('aria-hidden',String(hidden));}
}
function manual(event){
  if(document.getElementById('player').hidden||event?.target?.closest?.('#full-controller, #note-dialog, input, select, textarea'))return;
  manualScroll=true;suspendFollow();
}
window.resetPlayerFollow=()=>{lastFollowed=null;};
window.resetPlayerHeader=()=>{header(false);manualScroll=false;previousY=window.scrollY||0;directionDistance=0;window.resumePlayerFollow();};
window.holdPlayerFollow=()=>{lastFollowed=buttons[Phrase.activeIndex(phrases,audio.currentTime)];};
window.resumePlayerFollow=()=>{followEnabled=true;lastFollowed=null;resumeFollow.hidden=true;};
resumeFollow.addEventListener('click',()=>{window.resumePlayerFollow();update();});
window.addEventListener('wheel',manual,{passive:true});
window.addEventListener('touchmove',manual,{passive:true});
window.addEventListener('pointerdown',event=>{
  if(event.target===document.documentElement)manual(event);
},{passive:true});
window.addEventListener('keydown',event=>{
  if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target.closest?.('input,select,button,textarea'))manual(event);
});
window.addEventListener('scroll',()=>{
  const y=window.scrollY||0,delta=y-previousY;previousY=y;
  if(!manualScroll||document.getElementById('note-dialog')?.open)return;
  if(Math.sign(delta)!==Math.sign(directionDistance))directionDistance=0;
  directionDistance+=delta;
  if(Math.abs(directionDistance)>=12){header(directionDistance>0);directionDistance=0;}
},{passive:true});
function measureControls(){
  if(!document.body.style)return;
  const nav=document.getElementById('screen-nav');
  document.body.style.setProperty('--player-nav-height',`${nav.getBoundingClientRect().height}px`);
  document.body.style.setProperty('--player-dock-height',`${fullController.getBoundingClientRect().height}px`);
  lastFollowed=null;
}
if(typeof ResizeObserver!=='undefined'){
  const sizes=new ResizeObserver(measureControls);sizes.observe(fullController);sizes.observe(document.getElementById('screen-nav'));
}
window.addEventListener('resize',measureControls);measureControls();
window.followPlayerPhrase=(row,playing)=>{
  if(!followEnabled||!playing||!row||!window.innerHeight||document.getElementById('note-dialog')?.open)return;
  if(row===lastFollowed)return;
  const rect=row.getBoundingClientRect();
  const sources=document.querySelector('.source-area').getBoundingClientRect();
  const mobile=window.matchMedia('(max-width:959px)').matches;
  const nav=document.getElementById('screen-nav').getBoundingClientRect?.();
  const top=headerHidden?12:mobile?Math.max(12,sources.bottom+12):Math.max(20,(nav?.bottom||0)+12);
  const bottom=Math.min(window.innerHeight,fullController.getBoundingClientRect().top)-16;
  if(bottom<=top)return;
  lastFollowed=row;
  if(rect.top<top||rect.bottom>bottom){
    manualScroll=false;directionDistance=0;header(true);
    const target=Math.max(0,window.scrollY+rect.top-top-Math.max(0,(bottom-top-Math.min(rect.height,bottom-top))/3));
    window.scrollTo({top:target,behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }
};
