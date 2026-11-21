'use strict';
const $ = id => document.getElementById(id);
let song = {schemaVersion:1, songId:`song-${Date.now().toString(36)}`, title:'', artist:'', sections:[{name:'Aメロ', phrases:[]}]};
let selected = null, sectionIndex = 0, dirty = false, importGeneration = 0;
const audio = $('audio');
function error(message = '') {
  $('error').textContent = message; $('error').hidden = !message;
  if(message && $('audio-status').textContent === '音源を読み込み中…') $('audio-status').textContent = '音源の読み込み状況を確認してください';
}
function changed() { dirty = true; error(); engine.stopAt = null; $('status').textContent = '未保存の変更があります。JSONをダウンロードして保存してください。'; }
function locationOfSelection() {
  for(let s = 0; s < song.sections.length; s++) { const i = song.sections[s].phrases.findIndex(p => p.id === selected); if(i >= 0) return {s, i, p:song.sections[s].phrases[i]}; }
  return null;
}
const engine = new Phrase.AudioController(audio, updateAudio, error);
function updateAudio() {
  $('current').textContent = `${Phrase.format(audio.currentTime)} (${(audio.currentTime || 0).toFixed(3)}秒)`;
  $('duration').textContent = Phrase.format(audio.duration); $('seek').max = Number.isFinite(audio.duration) ? audio.duration : 0; $('seek').value = audio.currentTime || 0;
  $('play').textContent = audio.paused ? '再生' : '一時停止';
  // During construction there are no media events; callbacks run after initialization.
  $('play').disabled = !engine.ready; $('seek').disabled = !engine.ready;
  $('stamp-start').disabled = $('stamp-end').disabled = !engine.ready || !locationOfSelection();
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
      const text = document.createElement('span'); text.textContent = p.text || '（歌詞未入力）'; const time = document.createElement('small'); time.textContent = `${p.start ?? '未設定'} ～ ${p.end ?? '未設定'} 秒`; text.append(time); button.append(text);
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
  for(const key of ['text','start','end']) $(key).value = loc ? loc.p[key] ?? '' : '';
  if(loc) $('phrase-section').value = loc.s;
  updateAudio();
}
function render() { renderSections(); renderList(); renderSelection(); }
function metadata() { $('title').value = song.title; $('artist').value = song.artist; $('song-id').value = song.songId; }
metadata(); render();
for(const [key, property] of [['title','title'],['artist','artist'],['song-id','songId']]) $(key).addEventListener('input', () => { song[property] = $(key).value; changed(); });
$('section').addEventListener('change', () => { sectionIndex = Number($('section').value); $('section-name').value = song.sections[sectionIndex].name; });
$('add-section').addEventListener('click', () => { song.sections.push({name:$('section-name').value.trim() || '新しいセクション', phrases:[]}); sectionIndex = song.sections.length - 1; changed(); render(); });
$('rename-section').addEventListener('click', () => { const name = $('section-name').value.trim(); if(!name) return error('セクション名を入力してください。'); song.sections[sectionIndex].name = name; changed(); render(); });
function addPhrase(text) { const p = {id:EditorModel.id(song), text, start:null, end:null}; song.sections[sectionIndex].phrases.push(p); selected = p.id; }
$('generate').addEventListener('click', () => { const lines = $('bulk').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if(!lines.length) return error('歌詞を入力してください。'); lines.forEach(addPhrase); $('bulk').value = ''; changed(); render(); });
$('add-phrase').addEventListener('click', () => { addPhrase(''); changed(); render(); $('text').focus(); });
for(const key of ['text', 'start', 'end']) $(key).addEventListener('input', () => {
  const loc = locationOfSelection(); if(!loc) return; loc.p[key] = key === 'text' ? $(key).value : $(key).value === '' ? null : Number($(key).value); changed(); renderList();
});
$('phrase-section').addEventListener('change', () => { const loc = locationOfSelection(); if(!loc) return; const target = Number($('phrase-section').value); song.sections[loc.s].phrases.splice(loc.i, 1); song.sections[target].phrases.push(loc.p); sectionIndex = target; changed(); render(); });
for(const [key, delta] of [['up',-1],['down',1]]) $(key).addEventListener('click', () => { const loc = locationOfSelection(); if(!loc) return; const list = song.sections[loc.s].phrases, target = loc.i + delta; if(target < 0 || target >= list.length) return error('セクションの端です。別のセクションへは所属セクションを変更してください。'); [list[loc.i], list[target]] = [list[target], list[loc.i]]; changed(); render(); });
$('delete').addEventListener('click', () => { const loc = locationOfSelection(); if(!loc || !confirm('選択したフレーズを削除しますか？')) return; song.sections[loc.s].phrases.splice(loc.i, 1); selected = null; changed(); render(); });
for(const action of ['split','merge']) $(action).addEventListener('click', () => { const loc = locationOfSelection(); if(!loc) return; try { selected = EditorModel[action](song, loc.s, loc.i, $('text').selectionStart).id; changed(); render(); $('status').textContent = action === 'split' ? '分割しました。時刻は中間点で仮分割しています。試聴して調整してください。' : '結合しました。終了時刻を確認してください。'; } catch(e) { error(e.message); } });
$('audio-file').addEventListener('change', event => { const file = event.target.files[0]; if(!file) return; error(); $('audio-status').textContent = '音源を読み込み中…'; engine.load(file, () => { $('audio-status').textContent = `${file.name} 読み込み完了`; }); });
$('play').addEventListener('click', () => { error(); if(audio.paused) engine.play(audio.ended ? 0 : undefined); else audio.pause(); });
$('seek').addEventListener('input', () => engine.seek(Number($('seek').value)));
for(const key of ['start','end']) {
  $(`stamp-${key}`).addEventListener('click', () => { const loc = locationOfSelection(); if(!loc || !engine.ready) return; loc.p[key] = Number(audio.currentTime.toFixed(3)); changed(); render(); });
  $(`jump-${key}`).addEventListener('click', () => { const loc = locationOfSelection(); if(!engine.ready) return error('音源を読み込んでください。'); const value = loc?.p[key]; if(typeof value !== 'number' || value < 0 || value > audio.duration) return error('音源の範囲内の時刻を登録してください。'); engine.seek(value); });
}
$('preview').addEventListener('click', () => { const loc = locationOfSelection(); if(!engine.ready) return error('音源を読み込んでください。'); if(!Phrase.isTimed(loc?.p)) return error('試聴するには開始・終了時刻を設定してください。'); try { Phrase.validate({...song, sections:[{name:'試聴', phrases:[loc.p]}]}, audio.duration); error(); engine.play(loc.p.start, loc.p.end); } catch(e) { error(e.message); } });
$('export').addEventListener('click', () => {
  try {
    Phrase.validate(song, engine.ready ? audio.duration : Infinity);
    const url = URL.createObjectURL(new Blob([JSON.stringify(song, null, 2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `${song.songId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'song'}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    dirty = false; error(); $('status').textContent = engine.ready ? 'JSONのダウンロードを開始しました。保存先を確認してください。' : 'JSONを保存します。音源未選択のため、音源長との照合はプレイヤー読み込み時に行います。';
  } catch(e) { error(e.message); }
});
$('json-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if(!file) return; const generation = ++importGeneration;
  try { const data = Phrase.parse(await file.text()); if(generation !== importGeneration) return;
    if(dirty && !confirm('未保存の編集内容を、選択したJSONで置き換えますか？')) return;
    engine.stopAt = null; audio.pause(); song = data; sectionIndex = 0; selected = null; dirty = false; metadata(); render(); error(); $('status').textContent = 'JSONを読み込みました。対応する音源を選び、編集してください。';
    if(engine.ready) Phrase.validate(song, audio.duration);
  } catch(e) { if(generation === importGeneration) error(e.message); }
  finally { event.target.value = ''; }
});
window.addEventListener('beforeunload', event => { if(dirty || $('bulk').value.trim()) { event.preventDefault(); event.returnValue = ''; } });
