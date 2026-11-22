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
