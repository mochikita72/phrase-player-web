'use strict';
const message=document.getElementById('error'), messageHome=message.parentNode;
for(const button of document.querySelectorAll('[data-dialog]'))button.addEventListener('click',()=>{
  const dialog=document.getElementById(button.dataset.dialog);
  dialog.returnScroll=window.scrollY;dialog.opener=button;dialog.append(message);dialog.showModal();
});
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{messageHome.append(message);dialog.opener?.focus({preventScroll:true});window.scrollTo(0,dialog.returnScroll||0);});
}
const panel=document.querySelector('.audio-panel');
new IntersectionObserver(([entry])=>panel.classList.toggle('compact',!entry.isIntersecting),{threshold:0}).observe(document.getElementById('audio-sentinel'));
new ResizeObserver(()=>document.documentElement.style.setProperty('--audio-height',panel.getBoundingClientRect().height+'px')).observe(panel);
