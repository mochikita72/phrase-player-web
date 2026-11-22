'use strict';
const $=id=>document.getElementById(id), audio=$('audio');
let record=null, phrases=[], buttons=[], mode='continuous', chosen=-1, dirty=false, saving=false, pendingAudio=null, importGeneration=0, audioGeneration=0, viewGeneration=0, currentOffset=0, switchPoint=null, editVersion=0;
function error(message=''){$('error').textContent=message;$('error').hidden=!message;if(message)status('');}
let statusTimer;
function status(message,temporary=false){clearTimeout(statusTimer);$('library-status').textContent=message;if(temporary)statusTimer=setTimeout(()=>{$('library-status').textContent='';},6000);}
const engine=new Phrase.AudioController(audio,update,error);
let lastAudibleVolume=1;
function volumeState(persist=false){
  const value=Math.round(audio.volume*100),silent=audio.muted||value===0;
  $('volume').value=value;$('volume-value').textContent=audio.muted?'0%（ミュート）':value+'%';
  $('mute').textContent=silent?'🔇':'🔊';$('mute').title=silent?'ミュート解除':'ミュート';$('mute').setAttribute('aria-label',$('mute').title);$('mute').setAttribute('aria-pressed',String(silent));
  if(value>0)lastAudibleVolume=audio.volume;
  if(persist)try{window.localStorage?.setItem('phrase-studio-volume',JSON.stringify({volume:audio.volume,muted:audio.muted,lastAudibleVolume}));}catch{}
}
function restoreVolume(){
  audio.volume=1;audio.muted=false;
  try{const saved=JSON.parse(window.localStorage?.getItem('phrase-studio-volume')||'null');if(saved&&Number.isFinite(saved.volume)&&saved.volume>=0&&saved.volume<=1){audio.volume=saved.volume;audio.muted=saved.muted===true;if(Number.isFinite(saved.lastAudibleVolume)&&saved.lastAudibleVolume>0&&saved.lastAudibleVolume<=1)lastAudibleVolume=saved.lastAudibleVolume;}}catch{}
  volumeState();
}
$('volume').addEventListener('input',()=>{audio.volume=Math.max(0,Math.min(100,Number($('volume').value)))/100;audio.muted=false;volumeState(true);});
$('mute').addEventListener('click',()=>{if(audio.muted||audio.volume===0){audio.muted=false;if(audio.volume===0)audio.volume=lastAudibleVolume;}else audio.muted=true;volumeState(true);});
audio.addEventListener('volumechange',()=>volumeState());
restoreVolume();
const sources=Sources.mount({container:$('source-manager'),select:$('source-select'),record:()=>record,onError:error,onSwitch:switchSource,onChange:(kind,before)=>{
  dirty=true;editVersion++;status('音源の変更は未保存です。「保存・JSON書き出し」で残してください。');
  if(kind==='file') switchSource(record.activeAudioId);
  else if(kind==='offset'){const logical=audio.currentTime-(before??currentOffset);currentOffset=Sources.selected(record)?.offset||0;engine.seek(Math.max(0,Math.min(audio.duration||0,logical+currentOffset)));rebuild();if(mode==='segment')arm();}
}});
function update(){
  const loop=phrases[chosen];
  if(mode==='segment'&&engine.ready&&!audio.paused&&loop?.playable&&audio.currentTime>=loop.end)audio.currentTime=loop.leadStart;
  if(mode==='segment'&&chosen<0)chosen=Phrase.activeIndex(phrases,audio.currentTime);
  $('current').textContent=Phrase.format(audio.currentTime);$('duration').textContent=Phrase.format(audio.duration);
  $('seek').max=Number.isFinite(audio.duration)?audio.duration:0;$('seek').value=audio.currentTime||0;
  $('play').textContent='';$('play').classList.toggle('is-playing',!audio.paused);$('play').title=audio.paused?'再生':'一時停止';$('play').setAttribute('aria-label',$('play').title);$('play').disabled=$('seek').disabled=!engine.ready;
  $('previous').disabled=$('next').disabled=!engine.ready||!phrases.some(p=>p.playable);
  $('compact-play').textContent='';$('compact-play').classList.toggle('is-playing',!audio.paused);$('compact-play').setAttribute('aria-label',audio.paused?'再生':'一時停止');$('compact-play').title=$('play').title;$('compact-play').disabled=$('play').disabled;
  $('compact-previous').disabled=$('compact-next').disabled=$('previous').disabled;
  window.refreshCompactPlayer?.();
  document.body.classList.toggle('player-open',!$('player').hidden);
  let index=Phrase.activeIndex(phrases,audio.currentTime,mode==='segment'?chosen:-1);
  buttons.forEach((b,i)=>{b.classList.toggle('selected',false);b.setAttribute('aria-pressed',String(i===index));b.classList.toggle('active',i===index);if(i===index)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  window.followPlayerPhrase?.(buttons[index],!audio.paused);
}
function rebuild(){
  if(!record)return;
  phrases=Phrase.timeline(record.song,engine.ready?audio.duration:Infinity,currentOffset);buttons=[];$('lyrics').replaceChildren();
  $('open-editor').href='../editor/?song='+encodeURIComponent(record.id);
  $('title').textContent=record.song.title||'無題の曲';$('artist').textContent=record.song.artist;
  $('compact-title').textContent=$('title').textContent;$('compact-artist').textContent=record.song.artist;$('compact-artist').hidden=!record.song.artist;
  let index=0;
  for(const section of record.song.sections){
    const group=document.createElement('section'), h=document.createElement('h2');h.textContent=section.name;group.append(h);
    for(const row of section.phrases){
      const i=index++,p=phrases[i],b=document.createElement('button'),time=document.createElement('time'),text=document.createElement('span');
      b.className='phrase';b.disabled=!engine.ready||!p.playable;
      time.textContent=!Phrase.isTimed(row)?'時刻未設定':!p.playable?'範囲外':Phrase.format(row.start);text.textContent=row.text;
      b.append(time,text);b.addEventListener('click',()=>playPhrase(i));group.append(b);buttons.push(b);
    }$('lyrics').append(group);
  }
  $('phrase-note').textContent=phrases.length?Phrase.warnings(record.song,engine.ready?audio.duration:Infinity,currentOffset):'フレーズはまだありません。音源の再生は利用できます。歌詞はEditorで追加できます。';
  const available=phrases.some(p=>p.playable);for(const radio of document.querySelectorAll('[name=mode]'))radio.disabled=!available;
  if(!available){mode='continuous';document.querySelectorAll('[name=mode]')[0].checked=true;engine.stopAt=null;}
  renderSourceButtons();$('screen-nav').hidden=!$('library-view').hidden;
  $('player').hidden=!$('library-view').hidden;update();
}
function renderSourceButtons(){
  const tracks=record?.audios||[];$('source-picker').hidden=tracks.length<=3;$('source-buttons').hidden=tracks.length<1||tracks.length>3;$('source-buttons').replaceChildren();
  $('compact-sources').replaceChildren();$('compact-source-select').replaceChildren();$('compact-sources').hidden=tracks.length<1||tracks.length>3;$('compact-source-select').hidden=tracks.length<4;
  for(const track of tracks){
    const option=document.createElement('option');option.value=track.id;option.textContent=track.name;$('compact-source-select').append(option);
    if(tracks.length>=1&&tracks.length<=3){const button=document.createElement('button');button.className='secondary';button.textContent=track.name;button.title=track.name;button.setAttribute('aria-pressed',String(track.id===record.activeAudioId));button.addEventListener('click',()=>switchSource(track.id));$('compact-sources').append(button);}
  }
  $('compact-source-select').value=record?.activeAudioId||'';
  if(tracks.length<1||tracks.length>3)return;
  for(const track of tracks){const button=document.createElement('button');button.className='secondary';button.textContent=track.name;button.title=track.name;button.setAttribute('aria-pressed',String(track.id===record.activeAudioId));button.addEventListener('click',()=>switchSource(track.id));$('source-buttons').append(button);}
}
function playPhrase(index){const p=phrases[index];if(!p?.playable||!engine.ready)return;chosen=index;error();window.resumePlayerFollow?.();engine.play(p.leadStart);}
function arm(){
  engine.stopAt=null;
  const p=phrases[chosen];
  if(!p?.playable||audio.currentTime<p.leadStart||audio.currentTime>=p.end)chosen=Phrase.activeIndex(phrases,audio.currentTime);
}
audio.addEventListener('ended',()=>{const p=phrases[chosen];if(mode==='segment'&&engine.ready&&p?.playable&&audio.currentTime>=p.end)engine.play(p.leadStart);});
function switchSource(id, restore=false){
  if(!record)return;
  const source=record.audios.find(a=>a.id===id)||Sources.selected(record);
  const point=restore?{logical:0,playing:false}:switchPoint||{logical:audio.currentTime-currentOffset,playing:!audio.paused};
  switchPoint=point;record.activeAudioId=source?.id||'';currentOffset=source?.offset||0;sources.render();
  engine.reset();rebuild();
  if(!source?.file){switchPoint=null;status('この音源のファイルが未登録です。Editorの「曲情報・音源」で登録してください。');return;}
  status('音源を読み込んでいます…');
  engine.load(source.file,()=>{
    source.duration=audio.duration;rebuild();
    const time=Math.max(0,Math.min(audio.duration,point.logical+currentOffset));engine.seek(time);
    if(mode==='segment')arm();
    if(point.playing && time<audio.duration)engine.play(time);
    switchPoint=null;status(dirty?'未保存の変更があります。':'');update();
  },source.fileName);
}
async function refreshList(){
  try {const songs=await Library.list();$('song-select').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='保存した曲を選択';$('song-select').append(empty);
    for(const song of songs){const option=document.createElement('option');option.value=song.id;option.textContent=`${song.title} — ${song.artist}`;$('song-select').append(option);}
    $('song-select').value=record?.id||'';
    $('song-cards').replaceChildren();$('empty-library').hidden=songs.length>0;
    for(const song of songs){const row=document.createElement('article');row.className='card song-card';const choose=document.createElement('button');choose.className='secondary song-choice';const name=document.createElement('strong'),dash=document.createElement('span'),artist=document.createElement('span');name.className='song-name';name.textContent=song.title||'無題の曲';dash.className='song-divider';dash.textContent=' – ';artist.className='song-artist';artist.textContent=song.artist||'アーティスト未設定';choose.append(name,dash,artist);choose.addEventListener('click',()=>openSaved(song.id));const remove=document.createElement('button');remove.className='secondary';remove.textContent='⌫';remove.title='曲を削除';remove.setAttribute('aria-label',(song.title||'無題の曲')+'を削除');remove.addEventListener('click',async()=>{if(!confirm('「'+(song.title||'無題の曲')+'」と保存音源をこの端末から削除しますか？書き出したJSONや元の音源ファイルには影響しません。'))return;remove.disabled=true;try{await Library.remove(song.id,song.revision);if(record?.id===song.id){engine.reset();record=null;phrases=[];buttons=[];dirty=false;$('open-editor').href='../editor/';}await refreshList();status('曲と保存音源を削除しました。',true);}catch(e){error(e.message);}finally{remove.disabled=false;}});const edit=document.createElement('a');edit.className='row-edit';edit.textContent='✎';edit.title='曲を編集';edit.href='../editor/?song='+encodeURIComponent(song.id);edit.setAttribute('aria-label',(song.title||'無題の曲')+'を編集');row.append(choose,remove,edit);
      const order=document.createElement('div');order.className='song-order';
      for(const [direction,label] of [[-1,'上へ'],[1,'下へ']]){const button=document.createElement('button');button.className='secondary';button.textContent=direction<0?'↑':'↓';button.title=label;button.setAttribute('aria-label',(song.title||'無題の曲')+'を'+label);const index=songs.indexOf(song);button.disabled=index+direction<0||index+direction>=songs.length;button.addEventListener('click',async()=>{button.disabled=true;try{await Library.move(song.id,direction);await refreshList();}catch(e){error(e.message);button.disabled=false;}});order.append(button);}row.append(order);$('song-cards').append(row);}
  }catch(e){error(e.message);}
}
function canLeave(){return !saving&&(!dirty||confirm('未保存の変更があります。移動すると変更が失われます。続けますか？'));}
function setRecord(value){Phrase.validate(value.song);$('library-view').hidden=true;viewGeneration++;audioGeneration++;importGeneration++;record=value;error();record.activeAudioId=record.audios[0]?.id||'';chosen=-1;dirty=false;switchPoint=null;pendingAudio=null;$('manage').open=false;sources.render();switchSource(record.activeAudioId,true);}
async function openSaved(id){
  if(!id||!canLeave()){$('song-select').value=record?.id||'';return;}
  const generation=++viewGeneration;
  try{const value=await Library.get(id);if(generation!==viewGeneration)return;if(!value)throw new Error('保存曲が見つかりません。一覧を更新してください。');setRecord(value);await Library.remember(id);}catch(e){error(e.message);}
}
$('song-select').addEventListener('change',()=>openSaved($('song-select').value));
$('refresh-list').addEventListener('click',refreshList);
$('new-song').addEventListener('click',()=>{
  if(!canLeave())return;viewGeneration++;importGeneration++;audioGeneration++;engine.reset();record=null;phrases=[];buttons=[];dirty=false;chosen=-1;pendingAudio=null;switchPoint=null;currentOffset=0;
  $('player').hidden=true;$('manage').open=true;$('audio-file').value=$('json-file').value='';$('audio-status').textContent='音源を選択してください';$('json-status').textContent='JSONを選択してください';sources.render();status('JSONと音源を選択してください。');error();
});
function showLibrary(){viewGeneration++;$('screen-nav').hidden=true;audio.pause();$('library-view').hidden=false;$('player').hidden=true;$('compact-player').hidden=true;document.body.classList.toggle('player-open',false);status('');error();void refreshList();window.scrollTo(0,0);}
$('change').addEventListener('click',event=>{event.preventDefault?.();showLibrary();});
$('reload-library').addEventListener('click',refreshList);
$('open-editor').addEventListener('click',event=>{if(dirty||saving){event.preventDefault?.();$('edit').click();}});
$('audio-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;const generation=++audioGeneration;viewGeneration++;error();$('audio-status').textContent='音源を確認しています…';
  try{const duration=await Sources.probe(file);if(generation!==audioGeneration)return;pendingAudio={file,duration};$('audio-status').textContent=`${file.name} 読み込み完了`;
    if(record)await attachPending();
  }catch(e){error(e.message);$('audio-status').textContent='音源を選び直してください';}
});
async function attachPending(){
  if(!record||!pendingAudio)return;
  const {file,duration}=pendingAudio;let source=Sources.selected(record);
  if(!source){source={id:'audio-main',name:'音源1',offset:0};record.audios.push(source);}
  else if(source.file&&!confirm(`「${source.name}」を選択した音源で差し替えますか？追加は音源管理欄を使用してください。`))return;
  Object.assign(source,{file,fileName:file.name,duration});record.activeAudioId=source.id;pendingAudio=null;dirty=true;editVersion++;switchSource(source.id,true);$('manage').open=false;
}
$('json-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file||!canLeave())return;const generation=++importGeneration;viewGeneration++;
  try{const song=Phrase.parse(await file.text());if(generation!==importGeneration)return;
    let previous=null;try{previous=await Library.get(song.songId);}catch(e){status(e.message);}
    if(generation!==importGeneration)return;
    if(previous&&!confirm('同じ曲IDが端末にあります。音源を維持してJSONを更新する準備をしますか？保存ボタンで確定します。'))return;
    if(record?.id===song.songId)previous=record;
    $('library-view').hidden=true;record=Library.fromSong(song,previous);dirty=true;editVersion++;chosen=-1;switchPoint=null;viewGeneration++;$('json-status').textContent=`${song.title} 読み込み完了`;
    if(pendingAudio)await attachPending();else{switchSource(record.activeAudioId,true);$('manage').open=!record.audios.some(a=>a.file);}
    sources.render();error();
  }catch(e){error(e.message);}
});
$('save-library').addEventListener('click',async()=>{
  if(!record)return error('先に曲のJSONを読み込んでください。');if(saving)return;saving=true;$('save-library').disabled=true;
  const target=record,version=editVersion;
  try{const result=await Library.saveBoth(target);if(record===target){if(result.saved){record.revision=result.saved.revision;record.id=result.saved.id;if(version===editVersion)dirty=!result.jsonStarted;}await refreshList();status(result.message+(version!==editVersion?'\n保存中の追加変更は未保存です。':''));}}
  finally{saving=false;$('save-library').disabled=false;}
});
$('backup').addEventListener('click',()=>{try{if(!record)throw new Error('曲を選択してください。');Library.download(record);status('JSONダウンロードを開始しました。保存先を確認してください。');}catch(e){error(e.message);}});
$('delete-song').addEventListener('click',async()=>{
  if(!record?.revision)return error('端末に保存された曲を選択してください。');if(!confirm('この曲と登録音源を端末内保存から削除しますか？元のJSON・音源ファイルは削除しません。'))return;
  try{await Library.remove(record.id,record.revision);dirty=false;$('new-song').click();await refreshList();status('端末内の曲を削除しました。');}catch(e){error(e.message);}
});
$('edit').addEventListener('click',async()=>{
  if(!record){location.href='../editor/';return;}
  if(saving)return;
  if(dirty&&!confirm('編集画面へ渡すため現在の曲を端末内に保存します。JSONバックアップは別途必要です。続けますか？'))return;
  try{if(dirty||!record.revision)record=await Library.save(record);dirty=false;location.href=`../editor/?song=${encodeURIComponent(record.id)}`;}catch(e){error(`編集画面へ渡せませんでした。${e.message} JSONを書き出してEditorで読み込む方法も使えます。`);}
});
$('play').addEventListener('click',()=>{
  if(!engine.ready)return;if(!audio.paused){audio.pause();return;}error();
  if(mode==='segment'&&!phrases.some(p=>p.playable))return error('開始時刻が設定されたフレーズがありません。');
  if(mode==='segment')arm();engine.play(audio.currentTime);
});
$('seek').addEventListener('input',()=>{chosen=-1;engine.seek(Number($('seek').value));if(mode==='segment')arm();});
for(const radio of document.querySelectorAll('[name=mode]'))radio.addEventListener('change',()=>{mode=radio.value;engine.stopAt=null;if(mode==='segment')arm();});
function move(direction){
  const indices=phrases.flatMap((p,i)=>p.playable?[i]:[]);if(!indices.length)return;
  const current=chosen>=0&&audio.currentTime>=phrases[chosen]?.leadStart&&audio.currentTime<=phrases[chosen]?.end?chosen:Phrase.activeIndex(phrases,audio.currentTime);
  let position=indices.indexOf(current);
  if(position>=0)position+=direction;else position=direction>0?indices.findIndex(i=>phrases[i].start>audio.currentTime):indices.findLastIndex(i=>phrases[i].start<audio.currentTime);
  if(position<0)position=direction>0?indices.length-1:0;playPhrase(indices[Math.max(0,Math.min(indices.length-1,position))]);
}
$('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));
$('compact-previous').addEventListener('click',()=>move(-1));$('compact-next').addEventListener('click',()=>move(1));
$('compact-play').addEventListener('click',()=>$('play').click());
$('compact-source-select').addEventListener('change',()=>switchSource($('compact-source-select').value));
window.addEventListener('focus',()=>{if(!$('library-view').hidden)void refreshList();});
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
window.addEventListener('pageshow',event=>{if(event.persisted&&!dirty){engine.reset();record=null;void boot();}});
async function boot(){$('screen-nav').hidden=true;$('library-view').hidden=false;if(new URLSearchParams(location.search).get('view')==='library'){showLibrary();return;}const generation=++viewGeneration;await refreshList();if(generation!==viewGeneration)return;try{const id=new URLSearchParams(location.search).get('song')||await Library.last();if(generation!==viewGeneration||record||dirty||pendingAudio)return;if(id){await openSaved(id);if(!record)showLibrary();}else showLibrary();}catch(e){error(e.message);}}
sources.render();update();void boot();
