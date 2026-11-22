/* Shared with the local editor. No network or persistent storage. */
(function (root) {
  'use strict';
  function validate(data, duration = Infinity) {
    const fail = message => { throw new Error(message); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const string = (value, name) => { if (typeof value !== 'string' || !value.trim()) fail(`${name}には空でない文字列が必要です。`); };
    if (!object(data)) fail('曲データはJSONオブジェクトにしてください。');
    if (data.schemaVersion !== 1) fail('schemaVersionは数値の1のみ対応しています。');
    string(data.songId, 'songId');
    for(const key of ['title','artist']) if(typeof data[key] !== 'string') fail(`${key}は文字列にしてください。`);
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
        // Legacy end is accepted but no longer controls playback or validation.
        for (const key of ['start']) {
          if (phrase[key] == null) continue;
          if (typeof phrase[key] !== 'number' || !Number.isFinite(phrase[key])) fail(`${label}の${key}は有限の数値にしてください。`);
          if (phrase[key] < 0) fail(`${label}の時刻は0秒以上にしてください。`);
          if (phrase[key] > duration) fail(`${label}の時刻が音源の長さを超えています。`);
        }
        if (phrase.start != null) {
          if (previous && phrase.start < previous.start) fail(`${label}の時系列順序が不正です。`);
          if (previous && phrase.start === previous.start) fail(`${label}の開始時刻が前の設定済みフレーズと重複しています。`);
          previous = phrase;
        }
        count++;
      });
    });

    if (data.audioSources !== undefined) {
      if (!Array.isArray(data.audioSources)) fail('audioSourcesは配列にしてください。');
      const sourceIds = new Set();
      for (const source of data.audioSources) {
        if (!object(source)) fail('音源情報の形式が不正です。');
        string(source.id, '音源ID'); string(source.name, '音源名');
        if (sourceIds.has(source.id)) fail('音源IDが重複しています。');
        sourceIds.add(source.id);
        if (!Number.isFinite(source.offset)) fail('音源の補正値は有限の数値にしてください。');
      }
    }
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
  function isTimed(phrase) { return !!phrase && Number.isFinite(phrase.start); }
  function timeline(song, duration, offset = 0) {
    const rows = flatten(song);
    return rows.map((p, i) => {
      if (!isTimed(p)) return {...p, start:null, end:null, playable:false};
      const next = rows.slice(i + 1).find(isTimed);
      const start = Math.max(0, p.start + offset);
      const end = Math.min(duration, next ? next.start + offset : duration);
      return {...p, registeredStart:p.start, start, end, leadStart:Math.max(0, p.start + offset - 1), playable:start < duration && end > start};
    });
  }
  function warnings(song, duration = Infinity, offset = 0) {
    const rows = flatten(song), unset = rows.filter(p => !isTimed(p)).length;
    const invalid = timeline(song, duration, offset).filter(p => isTimed(p) && !p.playable).length;
    return [unset ? `${unset}行の開始時刻が未設定です。再生対象から除外し、次の設定済み行までを区間とします。` : '', invalid ? `${invalid}行がこの音源の再生範囲外です。補正値・音源を確認してください。` : ''].filter(Boolean).join(' ');
  }
  function activeIndex(phrases, time, preferred = -1) {
    const contains = p => isTimed(p) && p.playable !== false && time >= p.start && time < p.end;
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
    load(file, onReady, fileName = file.name) {
      this.reset();
      if (!/\.(mp3|wav)$/i.test(fileName || '')) { this.error('対応する音源形式はWAV／MP3です。'); return; }
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
  const api = { validate, parse, format, flatten, isTimed, timeline, warnings, activeIndex, AudioController };
  if (typeof module !== 'undefined') module.exports = api;
  root.Phrase = api;
})(globalThis);
