/* Shared with the local editor. No network or persistent storage. */
(function (root) {
  'use strict';
  function validate(data, duration = Infinity) {
    const fail = message => { throw new Error(message); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const string = (value, name) => { if (typeof value !== 'string' || !value.trim()) fail(`${name}には空でない文字列が必要です。`); };
    if (!object(data)) fail('曲データはJSONオブジェクトにしてください。');
    if (data.schemaVersion !== 1) fail('schemaVersionは数値の1のみ対応しています。');
    for (const key of ['songId', 'title', 'artist']) string(data[key], key);
    if (!Array.isArray(data.sections) || !data.sections.length) fail('セクションが必要です。');
    const ids = new Set(); let previous = null; let count = 0;
    data.sections.forEach((section, s) => {
      if (!object(section)) fail(`セクション${s + 1}の形式が不正です。`);
      string(section.name, `セクション${s + 1}の名前`);
      if (!Array.isArray(section.phrases)) fail(`${section.name}のphrasesは配列にしてください。`);
      section.phrases.forEach((phrase, i) => {
        const label = `${section.name}・${i + 1}行目`;
        if (!object(phrase)) fail(`${label}の形式が不正です。`);
        string(phrase.id, `${label}のID`); string(phrase.text, `${label}の歌詞`);
        if (ids.has(phrase.id)) fail(`フレーズID「${phrase.id}」が重複しています。`);
        ids.add(phrase.id);
        for (const key of ['start', 'end']) {
          if (phrase[key] == null) continue;
          if (typeof phrase[key] !== 'number' || !Number.isFinite(phrase[key])) fail(`${label}の${key}は有限の数値にしてください。`);
          if (phrase[key] < 0) fail(`${label}の時刻は0秒以上にしてください。`);
          if (phrase[key] > duration) fail(`${label}の時刻が音源の長さを超えています。`);
        }
        if (isTimed(phrase) && phrase.start >= phrase.end) fail(`${label}の終了時刻は開始時刻より後にしてください。`);
        if (phrase.start != null) {
          if (previous && phrase.start < previous.start) fail(`${label}の時系列順序が不正です。`);
          previous = phrase;
        }
        count++;
      });
    });
    if (!count) fail('フレーズを1つ以上登録してください。');
    return data;
  }
  function parse(text, duration) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('JSONの構文が不正です。括弧やカンマを確認してください。'); }
    return validate(data, duration);
  }
  function format(seconds) {
    const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }
  function flatten(song) { return song.sections.flatMap(section => section.phrases); }
  function isTimed(phrase) { return !!phrase && Number.isFinite(phrase.start) && Number.isFinite(phrase.end); }
  function activeIndex(phrases, time, preferred = -1) {
    const contains = p => isTimed(p) && time >= p.start && time < p.end;
    if (contains(phrases[preferred])) return preferred;
    let index = -1;
    phrases.forEach((p, i) => { if (contains(p) && (index < 0 || p.start > phrases[index].start)) index = i; });
    return index;
  }
  class AudioController {
    constructor(audio, update, error) {
      this.audio = audio; this.update = update; this.error = error;
      this.url = null; this.stopAt = null; this.ready = false; this.generation = 0;
      this.tick = () => {
        if (this.stopAt !== null && audio.currentTime >= this.stopAt) {
          const end = this.stopAt; this.stopAt = null; audio.pause(); audio.currentTime = end;
        }
        update();
      };
      this.cancel = () => { cancelAnimationFrame(this.frame); clearInterval(this.timer); };
      const animate = () => { this.tick(); if (!audio.paused) this.frame = requestAnimationFrame(animate); };
      audio.addEventListener('play', () => { this.cancel(); this.frame = requestAnimationFrame(animate); this.timer = setInterval(this.tick, 25); update(); });
      for (const event of ['pause', 'ended']) audio.addEventListener(event, () => { this.cancel(); update(); });
      for (const event of ['timeupdate', 'seeked', 'durationchange']) audio.addEventListener(event, this.tick);
      audio.addEventListener('error', () => {
        this.ready = false; this.stopAt = null; this.cancel();
        if (this.cleanupLoad) this.cleanupLoad();
        error('音源を読み込み・再生できません。WAV／MP3のファイルを確認してください。'); update();
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.stopAt !== null) audio.pause(); });
      window.addEventListener('pagehide', () => audio.pause());
      window.addEventListener('beforeunload', () => { if (this.url) URL.revokeObjectURL(this.url); });
    }
    reset() {
      this.generation++; this.cancel(); this.audio.pause(); this.ready = false; this.stopAt = null;
      if (this.cleanupLoad) this.cleanupLoad();
      this.audio.removeAttribute('src'); this.audio.load();
      if (this.url) URL.revokeObjectURL(this.url); this.url = null; this.update();
    }
    load(file, onReady) {
      this.reset();
      if (!/\.(mp3|wav)$/i.test(file.name)) { this.error('対応する音源形式はWAV／MP3です。'); return; }
      const generation = this.generation;
      const ready = () => {
        if (generation !== this.generation || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
        this.cleanupLoad(); this.ready = true; onReady(); this.update();
      };
      const timeout = setTimeout(() => {
        if (generation === this.generation && !this.ready) { this.cleanupLoad(); this.error('音源の読み込みが完了しませんでした。別のWAV／MP3を選択してください。'); }
      }, 20000);
      this.cleanupLoad = () => { clearTimeout(timeout); this.audio.removeEventListener('canplay', ready); };
      this.audio.addEventListener('canplay', ready);
      this.url = URL.createObjectURL(file); this.audio.src = this.url; this.audio.load();
    }
    play(start, end = null) {
      if (!this.ready) return;
      this.stopAt = end;
      if (start !== undefined) this.audio.currentTime = start;
      const generation = this.generation;
      this.audio.play().catch(error => { if (generation === this.generation && error.name !== 'AbortError') this.error('再生できませんでした。再生ボタンをもう一度押してください。'); });
    }
    seek(time) { this.stopAt = null; if (this.ready) this.audio.currentTime = time; this.update(); }
  }
  const api = { validate, parse, format, flatten, isTimed, activeIndex, AudioController };
  if (typeof module !== 'undefined') module.exports = api;
  root.Phrase = api;
})(globalThis);
