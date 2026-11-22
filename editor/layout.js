'use strict';
(() => {
  const get=id=>document.getElementById(id),workspace=get('editor-workspace');
  const list=get('phrase-list-pane'),edit=get('editing-pane');
  const mobile=window.matchMedia('(max-width:959px)');
  let view='list',positions={list:0,edit:0};
  window.editorView=next=>{
    if(next!==view){positions[view]=window.scrollY;view=next;workspace.dataset.view=view;
      if(mobile.matches)window.scrollTo(0,positions[view]);
    }
    get('show-list').setAttribute('aria-pressed',String(view==='list'));
    get('show-edit').setAttribute('aria-pressed',String(view==='edit'));
  };
  get('show-list').addEventListener('click',()=>window.editorView('list'));
  get('show-edit').addEventListener('click',()=>window.editorView('edit'));
  const message=get('error'),home=message.parentNode;
  for(const button of document.querySelectorAll('[data-dialog]'))button.addEventListener('click',()=>{
    const dialog=get(button.dataset.dialog);dialog.returnScroll=window.scrollY;
    dialog.paneScroll=[list.scrollTop,edit.scrollTop];dialog.opener=button;
    dialog.append(message);dialog.showModal();
  });
  for(const dialog of document.querySelectorAll('dialog')){
    dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{
      if(message.parentNode===dialog)home.append(message);
      if(dialog.paneScroll){list.scrollTop=dialog.paneScroll[0];edit.scrollTop=dialog.paneScroll[1];}
      dialog.opener?.focus({preventScroll:true});
      if(dialog.returnScroll!==undefined)window.scrollTo(0,dialog.returnScroll);
    });
  }
  const menu=get('save-menu');
  document.addEventListener('pointerdown',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();}});
  // Desktop columns consume the remaining viewport. On mobile use natural page
  // scrolling so the software keyboard never sits behind a fixed editor footer.
  const measure=()=>document.documentElement.style.setProperty('--workspace-top',workspace.getBoundingClientRect().top+window.scrollY+'px');
  new ResizeObserver(measure).observe(document.querySelector('.studio-header'));
  new ResizeObserver(measure).observe(document.querySelector('.feedback'));
  window.addEventListener('resize',measure);measure();
})();
