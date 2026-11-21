'use strict';
const $ = id => document.getElementById(id);
let song = {schemaVersion:1, songId:`song-${Date.now().toString(36)}`, title:'', artist:'', sections:[{name:'Aメロ', phrases:[]}]};
let selected = null, sectionIndex = 0, dirty = false, importGeneration = 0;
let record=Library.fromSong(song), currentOffset=0, saving=false, editVersion=0, switchPoint=null;
const audio = $('audio');
function error(message = '') {
  $('error').textContent = message; $('error').hidden = !message;
  if(message && $('audio-status').textContent === '音源を読み込み中…') $('audio-status').textContent = '音源の読み込み状況を確認してください';
}
function changed() { dirty = true; editVersion++;record.song=song; error(); engine.stopAt = null; $('status').textContent = '未保存の変更があります。「保存」でJSONを書き出し、端末内データを更新してください。'; }
function locationOfSelection() {
  for(let s = 0; s < song.sections.length; s++) { const i = song.sections[s].phrases.findIndex(p => p.id === selected); if(i >= 0) return {s, i, p:song.sections[s].phrases[i]}; }
  return null;
}
const engine = new Phrase.AudioController(audio, updateAudio, error);
const sources=Sources.mount({container:$('source-manager'),select:$('source-select'),record:()=>record,onError:error,onSwitch:switchSource,onChange:(kind,before)=>{changed();if(kind==='file')switchSource(record.activeAudioId);else if(kind==='offset'){const logical=audio.currentTime-(before??currentOffset);currentOffset=Sources.selected(record)?.offset||0;engine.seek(Math.max(0,Math.min(audio.duration||0,logical+currentOffset)));renderList();renderSelection();}}});
function switchSource(id,restore=false){
  const source=record.audios.find(a=>a.id===id)||Sources.selected(record);
  const point=restore?{logical:0,playing:false}:switchPoint||{logical:audio.currentTime-currentOffset,playing:!audio.paused};
  switchPoint=point;record.activeAudioId=source?.id||'';currentOffset=source?.offset||0;engine.reset();sources.render();
  if(!source?.file){switchPoint=null;$('audio-status').textContent='音源ファイルを選択・登録してください。';renderList();renderSelection();return;}
  engine.load(source.file,()=>{source.duration=audio.duration;const time=Math.max(0,Math.min(audio.duration,point.logical+currentOffset));engine.seek(time);if(point.playing&&time<audio.duration)engine.play(time);switchPoint=null;$('audio-status').textContent=`${source.name}：補正 ${source.offset}秒`;renderList();renderSelection();},source.fileName);
}
function selectionTiming(){return Phrase.timeline(song,engine.ready?audio.duration:Infinity,currentOffset).find(p=>p.id===selected);}
function updateAudio() {
  $('current').textContent = `${Phrase.format(audio.currentTime)} (${(audio.currentTime || 0).toFixed(3)}秒)`;
  $('duration').textContent = Phrase.format(audio.duration); $('seek').max = Number.isFinite(audio.duration) ? audio.duration : 0; $('seek').value = audio.currentTime || 0;
  $('play').textContent = audio.paused ? '再生' : '一時停止';
  // During construction there are no media events; callbacks run after initialization.
  $('play').disabled = !engine.ready; $('seek').disabled = !engine.ready;
  $('stamp-start').disabled = !engine.ready || !locationOfSelection();
}
function renderSections() {
  for(const key of ['section', 'phrase-section']) {
    $(key).replaceChildren(); song.sections.forEach((section, index) => { const option = document.createElement('option'); option.value = index; option.textContent = section.name; $(key).append(option); });
  }
  $('section').value = sectionIndex; $('section-name').value = song.sections[sectionIndex].name;
}
function renderList() {
  $('list').replaceChildren();
  song.sections.forEach((section, s) => {
    const heading = document.createElement('h3'); heading.textContent = section.name; $('list').append(heading);
    section.phrases.forEach(p => {
      const button = document.createElement('button'); button.className = 'phrase'; button.classList.toggle('active', p.id === selected); button.setAttribute('aria-pressed', String(p.id === selected));
      const text = document.createElement('span'); text.textContent = p.text || '（歌詞未入力）'; const time = document.createElement('small'); time.textContent = `開始 ${p.start ?? '未設定'} 秒`; text.append(time); button.append(text);
      button.addEventListener('click', () => {
        selected = p.id; sectionIndex = s; engine.stopAt = null; render();
        if(window.matchMedia?.('(max-width: 800px)').matches) document.querySelector('.edit-panel').scrollIntoView({block:'start'});
      }); $('list').append(button);
    });
  });
}
function renderSelection() {
  const loc = locationOfSelection(); $('phrase-fields').disabled = !loc;
  $('selection').textContent = loc ? `ID: ${loc.p.id}` : 'フレーズを追加・選択してください。';
  for(const key of ['text','start']) $(key).value = loc ? loc.p[key] ?? '' : '';
  const timing=selectionTiming();$('auto-end').textContent=timing?.playable?`終了（自動・選択音源上）：${Number.isFinite(timing.end)?timing.end.toFixed(3)+'秒':'音源の末尾'}。試聴は1秒前から。`:'開始時刻を設定してください。音源の範囲外の区間は試聴できません。';
  if(loc) $('phrase-section').value = loc.s;
  updateAudio();
}
function render() { renderSections(); renderList(); renderSelection(); }
function metadata() { $('title').value = song.title; $('artist').value = song.artist; $('song-id').value = song.songId;$('song-id').readOnly=!!record.revision;$('back-player').href=record.revision?`../player/?song=${encodeURIComponent(record.id)}`:'../player/'; }
metadata(); render();
for(const [key, property] of [['title','title'],['artist','artist'],['song-id','songId']]) $(key).addEventListener('input', () => { song[property] = $(key).value; changed(); });
$('section').addEventListener('change', () => { sectionIndex = Number($('section').value); $('section-name').value = song.sections[sectionIndex].name; });
$('add-section').addEventListener('click', () => { song.sections.push({name:$('section-name').value.trim() || '新しいセクション', phrases:[]}); sectionIndex = song.sections.length - 1; changed(); render(); });
$('rename-section').addEventListener('click', () => { const name = $('section-name').value.trim(); if(!name) return error('セクション名を入力してください。'); song.sections[sectionIndex].name = name; changed(); render(); });
function addPhrase(text) { const p = {id:EditorModel.id(song), text, start:null}; song.sections[sectionIndex].phrases.push(p); selected = p.id; }
$('generate').addEventListener('click', () => { const lines = $('bulk').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if(!lines.length) return error('歌詞を入力してください。'); lines.forEach(addPhrase); $('bulk').value = ''; changed(); render(); });
$('add-phrase').addEventListener('click', () => { addPhrase(''); changed(); render(); $('text').focus(); });
for(const key of ['text', 'start']) $(key).addEventListener('input', () => {
  const loc = locationOfSelection(); if(!loc) return; loc.p[key] = key === 'text' ? $(key).value : $(key).value === '' ? null : Number($(key).value); changed(); renderList();
  const timing=selectionTiming();$('auto-end').textContent=timing?.playable?`終了（自動・選択音源上）：${Number.isFinite(timing.end)?timing.end.toFixed(3)+'秒':'音源の末尾'}`:'開始時刻または音源範囲を確認してください。';
});
$('phrase-section').addEventListener('change', () => { const loc = locationOfSelection(); if(!loc) return; const target = Number($('phrase-section').value); song.sections[loc.s].phrases.splice(loc.i, 1); song.sections[target].phrases.push(loc.p); sectionIndex = target; changed(); render(); });
for(const [key, delta] of [['up',-1],['down',1]]) $(key).addEventListener('click', () => { const loc = locationOfSelection(); if(!loc) return; const list = song.sections[loc.s].phrases, target = loc.i + delta; if(target < 0 || target >= list.length) return error('セクションの端です。別のセクションへは所属セクションを変更してください。'); [list[loc.i], list[target]] = [list[target], list[loc.i]]; changed(); render(); });
$('delete').addEventListener('click', () => { const loc = locationOfSelection(); if(!loc || !confirm('選択したフレーズを削除しますか？')) return; song.sections[loc.s].phrases.splice(loc.i, 1); selected = null; changed(); render(); });
for(const action of ['split','merge']) $(action).addEventListener('click', () => { const loc = locationOfSelection(); if(!loc) return; try { selected = EditorModel[action](song, loc.s, loc.i, $('text').selectionStart).id; changed(); render(); $('status').textContent = action === 'split' ? '分割しました。後半の開始時刻を設定してください。' : '結合しました。開始時刻は前の行を維持しています。'; } catch(e) { error(e.message); } });
$('audio-file').addEventListener('change', async event => { const file = event.target.files[0]; if(!file) return; const target=record;error(); $('audio-status').textContent = '音源を読み込み中…';try{await Sources.add(target,file,record.activeAudioId);if(record!==target)return;changed();switchSource(record.activeAudioId);}catch(e){error(e.message);}event.target.value=''; });
$('play').addEventListener('click', () => { error(); if(audio.paused) engine.play(audio.ended ? 0 : undefined); else audio.pause(); });
$('seek').addEventListener('input', () => engine.seek(Number($('seek').value)));
$('stamp-start').addEventListener('click',()=>{const loc=locationOfSelection();if(!loc||!engine.ready)return;const time=audio.currentTime-currentOffset;if(time<0)return error('補正後の共通時刻が負になります。音源の位置か補正値を調整してください。');loc.p.start=Number(time.toFixed(3));changed();render();});
$('jump-start').addEventListener('click',()=>{const timing=selectionTiming();if(!engine.ready||!timing?.playable)return error('音源と再生範囲内の開始時刻を設定してください。');engine.seek(timing.start);});
$('preview').addEventListener('click',()=>{if(!engine.ready)return error('音源を読み込んでください。');try{Phrase.validate(song);const timing=selectionTiming();if(!timing?.playable)throw new Error('このフレーズの開始時刻・音源の補正値を確認してください。');error();engine.play(timing.leadStart,timing.end);}catch(e){error(e.message);}});
$('export').addEventListener('click',async()=>{
  if(saving)return;saving=true;$('export').disabled=true;const version=editVersion;record.song=song;const target=record;
  try{const result=await Library.saveBoth(target);if(record===target){if(result.saved){record.revision=result.saved.revision;record.id=result.saved.id;}if(version===editVersion&&result.saved&&result.jsonStarted)dirty=false;metadata();error();$('status').textContent=result.message+(version!==editVersion?'\n保存操作中の追加変更は未保存です。':'');}}
  finally{saving=false;$('export').disabled=false;}
});
$('json-only').addEventListener('click',()=>{try{record.song=song;Library.download(record);$('status').textContent='JSONのダウンロードを開始しました。保存先を確認してください。端末内データは更新していません。';}catch(e){error(e.message);}});
$('json-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if(!file) return; const generation = ++importGeneration;
  try { const data = Phrase.parse(await file.text()); if(generation !== importGeneration) return;
    if(dirty && !confirm('未保存の編集内容を、選択したJSONで置き換えますか？')) return;
    let previous=record.id===data.songId?record:null;
    if(!previous)try{previous=await Library.get(data.songId);if(previous&&!confirm('同じ曲IDの保存曲があります。その音源を引き継いで編集しますか？'))return;}catch(e){$('status').textContent=e.message;}
    if(!previous&&!record.revision&&record.audios.length)previous={...record,revision:0};
    if(generation!==importGeneration)return;
    engine.stopAt = null; audio.pause(); song = data;record=Library.fromSong(song,previous); sectionIndex = 0; selected = null; dirty = true;editVersion++; metadata(); render();sources.render();switchSource(record.activeAudioId,true); error(); $('status').textContent = 'JSONを読み込みました。終了時刻は次の設定済み開始時刻から自動計算します。保存操作で端末内データを更新してください。';
  } catch(e) { if(generation === importGeneration) error(e.message); }
  finally { event.target.value = ''; }
});
window.addEventListener('beforeunload', event => { if(dirty || saving || $('bulk').value.trim()) { event.preventDefault(); event.returnValue = ''; } });
async function restore(){
  const id=new URLSearchParams(location.search).get('song');if(!id)return;const version=editVersion,generation=++importGeneration;
  try{const saved=await Library.get(id);if(version!==editVersion||generation!==importGeneration)return;if(!saved)throw new Error('保存曲が見つかりません。元のJSONを読み込んでください。');Phrase.validate(saved.song);record=saved;song=record.song;sectionIndex=0;selected=null;dirty=false;metadata();render();sources.render();switchSource(record.activeAudioId,true);$('status').textContent='端末内の曲を開きました。変更後はJSONも手元に保存してください。';}catch(e){error(e.message);}
}
sources.render();void restore();
