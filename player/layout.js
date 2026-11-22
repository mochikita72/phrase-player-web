'use strict';
// The full controller stays in normal document flow on mobile. This independent
// fixed bar never changes page height, audio nodes, or scroll position.
const fullController=document.getElementById('full-controller');
const compactPlayer=document.getElementById('compact-player');
let compactFrame=0;
window.refreshCompactPlayer=()=>{
  compactPlayer.hidden=!(window.matchMedia('(max-width:600px)').matches &&
    !document.getElementById('player').hidden && fullController.getBoundingClientRect().bottom<=0);
};
const scheduleCompact=()=>{if(compactFrame)return;compactFrame=requestAnimationFrame(()=>{compactFrame=0;window.refreshCompactPlayer();});};
window.addEventListener('scroll',scheduleCompact,{passive:true});
window.addEventListener('resize',scheduleCompact);
new ResizeObserver(scheduleCompact).observe(fullController);
document.getElementById('compact-details').addEventListener('click',()=>fullController.scrollIntoView({block:'start'}));
window.refreshCompactPlayer();
