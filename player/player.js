'use strict';
const $ = id => document.getElementById(id);
let song = null, phrases = [], buttons = [], mode = 'continuous', jsonGeneration = 0, chosen = -1;
const audio = $('audio');
function error(message = '') {
  $('error').textContent = message; $('error').hidden = !message;
  if (message && $('audio-status').textContent === '音源を読み込み中…') $('audio-status').textContent = '音源の読み込み状況を確認してください';
}
const engine = new Phrase.AudioController(audio, update, error);
function update() {
  $('current').textContent = Phrase.format(audio.currentTime);
  $('duration').textContent = Phrase.format(audio.duration);
  $('seek').max = Number.isFinite(audio.duration) ? audio.duration : 0;
  $('seek').value = audio.currentTime || 0;
  $('play').textContent = audio.paused ? '再生' : '一時停止';
  const index = Phrase.activeIndex(phrases, audio.currentTime, mode === 'segment' ? chosen : -1);
  $('previous').disabled = $('next').disabled = !phrases.some(Phrase.isTimed);
  buttons.forEach((button, i) => { button.classList.toggle('active', i === index); if (i === index) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
}
function openPlayer() {
  if (!song || !engine.ready) return;
  try { Phrase.validate(song, audio.duration); } catch (e) { error(e.message); return; }
  error(); phrases = Phrase.flatten(song); buttons = [];
  $('title').textContent = song.title; $('artist').textContent = song.artist; $('lyrics').replaceChildren();
  song.sections.forEach(section => {
    const group = document.createElement('section'); const heading = document.createElement('h2'); heading.textContent = section.name; group.append(heading);
    section.phrases.forEach(phrase => {
      const button = document.createElement('button'); button.className = 'phrase';
      const time = document.createElement('time'); time.textContent = Phrase.isTimed(phrase) ? Phrase.format(phrase.start) : '時刻未設定';
      button.disabled = !Phrase.isTimed(phrase);
      const text = document.createElement('span'); text.textContent = phrase.text;
      button.append(time, text); button.addEventListener('click', () => playPhrase(phrase)); group.append(button); buttons.push(button);
    }); $('lyrics').append(group);
  });
  $('loader').hidden = true; $('player').hidden = false; update();
}
function playPhrase(phrase) {
  if (!Phrase.isTimed(phrase)) return;
  chosen = phrases.indexOf(phrase); error(); engine.play(phrase.start, mode === 'segment' ? phrase.end : null);
}
$('audio-file').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return;
  error(); $('audio-status').textContent = '音源を読み込み中…';
  engine.load(file, () => { $('audio-status').textContent = `${file.name} ・ ${Phrase.format(audio.duration)} 読み込み完了`; openPlayer(); });
});
$('json-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const generation = ++jsonGeneration; song = null; error(); $('json-status').textContent = '曲データを読み込み中…';
  try {
    const text = await file.text(); if (generation !== jsonGeneration) return;
    song = Phrase.parse(text); $('json-status').textContent = `${file.name} 読み込み完了`; openPlayer();
  } catch (e) { if (generation === jsonGeneration) { $('json-status').textContent = '曲データを選び直してください'; error(e.message); } }
});
$('play').addEventListener('click', () => {
  error(); if (!audio.paused) { audio.pause(); return; }
  let time = audio.ended ? 0 : audio.currentTime;
  if (mode === 'segment') {
    const phrase = phrases[Phrase.activeIndex(phrases, time, chosen)] || phrases.find(p => Phrase.isTimed(p) && p.start >= time) || phrases.find(Phrase.isTimed);
    if (!phrase) { error('時刻が設定されたフレーズがありません。連続再生は利用できます。'); return; }
    chosen = phrases.indexOf(phrase);
    engine.play(time >= phrase.start && time < phrase.end ? time : phrase.start, phrase.end);
  } else engine.play(time);
});
$('seek').addEventListener('input', event => {
  chosen = -1;
  engine.seek(Number(event.target.value));
  if (mode === 'segment') {
    const phrase = phrases[Phrase.activeIndex(phrases, audio.currentTime)];
    if (phrase) engine.stopAt = phrase.end;
    else audio.pause();
  }
});
for (const radio of document.querySelectorAll('[name=mode]')) radio.addEventListener('change', () => {
  mode = radio.value; engine.stopAt = null;
  if (mode === 'segment') { const phrase = phrases[Phrase.activeIndex(phrases, audio.currentTime, chosen)]; if (phrase) engine.stopAt = phrase.end; else audio.pause(); }
});
function move(direction) {
  const playable = phrases.filter(Phrase.isTimed); if (!playable.length) return;
  const time = audio.currentTime;
  const anchor = mode === 'segment' && chosen >= 0 && time >= phrases[chosen].start && time <= phrases[chosen].end ? phrases[chosen] : phrases[Phrase.activeIndex(phrases, time)];
  const current = playable.indexOf(anchor);
  let index = current >= 0 ? current + direction : direction > 0 ? playable.findIndex(p => p.start > time) : playable.findLastIndex(p => p.end <= time);
  if (index < 0) index = direction > 0 ? playable.length - 1 : 0;
  playPhrase(playable[Math.max(0, Math.min(playable.length - 1, index))]);
}
$('previous').addEventListener('click', () => move(-1)); $('next').addEventListener('click', () => move(1));
$('change').addEventListener('click', () => {
  engine.reset(); jsonGeneration++; song = null; phrases = []; buttons = []; mode = 'continuous'; chosen = -1;
  document.querySelector('[value=continuous]').checked = true;
  $('audio-file').value = ''; $('json-file').value = ''; $('audio-status').textContent = '音源を選択してください'; $('json-status').textContent = '曲データを選択してください';
  $('lyrics').replaceChildren(); $('player').hidden = true; $('loader').hidden = false; error(); window.scrollTo(0, 0);
});
