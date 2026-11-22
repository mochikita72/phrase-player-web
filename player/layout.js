'use strict';
// One mounted transport: settings never reload audio or scroll lyrics.
const fullController=document.getElementById('full-controller');
const settingsToggle=document.getElementById('player-settings-toggle');
let settingsOpen=false;
function showSettings(open){settingsOpen=open;fullController.classList.toggle('settings-open',open);settingsToggle.setAttribute('aria-expanded',String(open));settingsToggle.textContent=open?'詳細を閉じる':'詳細設定';}
settingsToggle.addEventListener('click',()=>showSettings(!settingsOpen));
fullController.addEventListener('keydown',event=>{if(event.key==='Escape'&&settingsOpen){showSettings(false);settingsToggle.focus();}});
window.refreshCompactPlayer=()=>{document.getElementById('compact-player').hidden=true;};
window.refreshCompactPlayer();

let followEnabled=true,lastFollowed=null;
const resumeFollow=document.getElementById('resume-follow');
function suspendFollow(){followEnabled=false;resumeFollow.hidden=false;}
window.resumePlayerFollow=()=>{followEnabled=true;lastFollowed=null;resumeFollow.hidden=true;};
resumeFollow.addEventListener('click',()=>{window.resumePlayerFollow();update();});
window.addEventListener('wheel',suspendFollow,{passive:true});
window.addEventListener('touchmove',suspendFollow,{passive:true});
window.addEventListener('pointerdown',event=>{
  if(event.target===document.documentElement)suspendFollow();
},{passive:true});
window.addEventListener('keydown',event=>{
  if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target.closest?.('input,select,button,textarea'))suspendFollow();
});
window.followPlayerPhrase=(row,playing)=>{
  if(!followEnabled||!playing||!row||!window.innerHeight)return;
  if(row===lastFollowed)return;
  const rect=row.getBoundingClientRect();
  const sources=document.querySelector('.source-area').getBoundingClientRect();
  const mobile=window.matchMedia('(max-width:959px)').matches;
  const top=mobile?Math.max(12,sources.bottom+12):20;
  const bottom=Math.min(window.innerHeight,fullController.getBoundingClientRect().top)-16;
  if(bottom<=top)return;
  lastFollowed=row;
  if(rect.top<top||rect.bottom>bottom){
    const target=Math.max(0,window.scrollY+rect.top-top-Math.max(0,(bottom-top-Math.min(rect.height,bottom-top))/3));
    window.scrollTo({top:target,behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }
};
