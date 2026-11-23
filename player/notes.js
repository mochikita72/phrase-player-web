'use strict';
// Notes patch only the saved note field, with the same revision guard as song edits.
window.PlayerNotes=(()=>{
  const dialog=$('note-dialog'),input=$('note-input'),state=$('note-state');
  const queue=new Map();let running=null,target=null,showNotes=false,press=null,timer=null,suppressClick=false,returnY=0,opener=null;
  function status(text,failed=false){state.textContent=text;$('note-retry').hidden=!failed;}
  function paint(){
    document.body.classList.toggle('show-notes',showNotes);
    $('notes-mode').textContent=showNotes?'メモON':'メモOFF';$('notes-mode').setAttribute('aria-pressed',String(showNotes));
    for(const b of buttons){const p=Phrase.flatten(record.song).find(p=>p.id===b.dataset.phraseId);if(!p)continue;
      b.memoText.textContent=p.note||'';b.memoText.hidden=!p.note;
    }
  }
  function open(id){
    if(!record)return;
    const p=id===null?record.song:Phrase.flatten(record.song).find(p=>p.id===id);if(!p)return;
    target={record,id,p};input.value=p.note||'';
    $('note-heading').textContent=id===null?'曲全体のメモ':'フレーズメモ';
    $('note-time').hidden=id===null;$('note-time').textContent=Phrase.isTimed(p)?Phrase.format(p.start):'時刻未設定';
    $('note-lyric').textContent=id===null?(record.song.title||'無題の曲'):p.text;
    if(!queue.size)status('端末内へ自動保存します');
    if(!dialog.open){returnY=window.scrollY||0;opener=document.activeElement;dialog.showModal();}
  }
  function flush(){
    if(running)return running;
    running=(async()=>{
      while(queue.size){
        const [key,item]=queue.entries().next().value,value=item.value,rec=item.record;
        try{
          status('保存中…');
          const revision=rec.revision?await Library.saveNote(rec.id,item.id,value,rec.revision):(await Library.save(rec)).revision;
          rec.revision=revision;
          if(queue.get(key)?.value===value)queue.delete(key);
        }catch(e){status('未保存：'+e.message,true);return;}
      }
      status('端末内保存済み');
    })().finally(()=>{running=null;});
    return running;
  }
  input.addEventListener('input',()=>{
    if(!target)return;
    target.p.note=input.value;
    queue.set(JSON.stringify([target.record.id,target.id]),{record:target.record,id:target.id,value:input.value});
    paint();void flush();
  });
  $('note-retry').addEventListener('click',flush);
  $('note-close').addEventListener('click',()=>{void flush();dialog.close();});
  dialog.addEventListener('cancel',()=>{void flush();});
  dialog.addEventListener('close',()=>{window.holdPlayerFollow?.();opener?.focus?.({preventScroll:true});window.scrollTo(0,returnY);});
  $('song-note').addEventListener('click',()=>open(null));
  $('notes-mode').addEventListener('click',()=>{showNotes=!showNotes;paint();window.resetPlayerFollow?.();});
  function cancelPress(){clearTimeout(timer);timer=null;press=null;}
  function bind(button,p){
    const memo=document.createElement('span');
    memo.className='memo-text';
    memo.hidden=!p.note;memo.textContent=p.note||'';
    button.memoText=memo;button.append(memo);
    button.title='メモ：長押し・右クリック・Shift+F10';
    memo.addEventListener('click',event=>{event.stopPropagation?.();open(p.id);});
    button.addEventListener('contextmenu',event=>{event.preventDefault();cancelPress();suppressClick=true;open(p.id);});
    button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();open(p.id);}});
    button.addEventListener('pointerdown',event=>{
      cancelPress();suppressClick=false;if(event.pointerType==='mouse'||event.isPrimary===false)return;
      press={x:event.clientX,y:event.clientY};
      timer=setTimeout(()=>{suppressClick=true;cancelPress();open(p.id);},500);
    });
    button.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancelPress();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,cancelPress);
  }
  window.addEventListener('scroll',cancelPress,{passive:true});
  window.addEventListener('pagehide',()=>{void flush();});
  // Keep the sheet inside the visible viewport when a mobile keyboard opens.
  function viewport(){const v=window.visualViewport;if(v){dialog.style.setProperty('--note-height',`${v.height}px`);dialog.style.setProperty('--note-top',`${v.offsetTop}px`);}}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);viewport();
  return {bind,open,flush,pending:()=>queue.size>0||!!running,consumeClick:()=>{const used=suppressClick;suppressClick=false;return used;},paint};
})();
if(record)rebuild();
