const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const P = require('../player/common.js');
const original = JSON.parse(fs.readFileSync(`${__dirname}/../samples/sample-song.json`, 'utf8'));
const copy = () => structuredClone(original);
test('sample, decimal times, gaps and exact duration accepted', () => {
  assert.equal(P.validate(copy(), 9).songId, original.songId);
  assert.equal(P.activeIndex(P.flatten(original), 2.5), -1);
  assert.equal(P.activeIndex(P.flatten(original), 3), 1);
  assert.equal(P.format(65.8), '1:05');
});
for (const [label, mutate, match] of [
  ['version', s => s.schemaVersion = 2, /schemaVersion/],
  ['missing', s => delete s.title, /title/],
  ['type', s => s.sections[0].phrases[0].start = '0', /数値/],
  ['negative', s => s.sections[0].phrases[0].start = -1, /0秒/],
  ['duplicate start', s => s.sections[0].phrases[1].start = 0, /重複/],
  ['duplicate', s => s.sections[1].phrases[0].id = 'p001', /重複/],
  ['order', s => s.sections[0].phrases.reverse(), /時系列/],
  ['empty', s => s.sections = [], /セクション/],
]) test(`reject ${label}`, () => { const s = copy(); mutate(s); assert.throws(() => P.validate(s), match); });
test('duration overflow and JSON syntax', () => {
  assert.throws(() => P.validate(copy(), 5.9), /音源の長さ/);
  assert.throws(() => P.parse('{'), /構文/);
  assert.deepEqual(P.parse(JSON.stringify(original)), original);
});
test('overlap, missing, null and partial times are accepted without coercion', () => {
  const s = copy(); s.sections[0].phrases[1].start = 2;
  s.sections[0].phrases.push({id:'missing', text:'未設定'},{id:'partial',text:'途中',start:null,end:8});
  P.validate(s, 9);
  assert.equal(P.isTimed({start:null,end:2}), false);
  assert.equal(P.activeIndex(s.sections[0].phrases, 2.2), 1);
  assert.equal(P.activeIndex(s.sections[0].phrases, 2.2, 0), 0);
  assert.equal(P.activeIndex([{start:null,end:3}], 1), -1);
  s.sections[0].phrases[3].start = '8'; assert.throws(() => P.validate(s), /数値/);
});
test('next start across sections overrides legacy end; last uses audio duration',()=>{
  const s=copy();s.sections[0].phrases[0].end=-99;
  P.validate(s);const rows=P.timeline(s,12);
  assert.equal(rows[0].end,3);assert.equal(rows[1].end,6);assert.equal(rows[2].end,12);
  assert.equal(rows[1].leadStart,2);assert.equal(rows[0].leadStart,0);
});
test('offset then one-second lead, bounds, and missing starts',()=>{
  const s=copy();s.sections[0].phrases.splice(1,0,{id:'missing',text:'♪',start:null});
  let rows=P.timeline(s,10,2);assert.equal(rows[0].start,2);assert.equal(rows[0].leadStart,1);assert.equal(rows[0].end,5);assert.equal(rows[1].playable,false);assert.match(P.warnings(s),/1行/);
  rows=P.timeline(s,10,-4);assert.equal(rows[0].playable,false);assert.equal(rows[2].start,0);assert.equal(rows[2].end,2);assert.equal(rows[3].end,10);
  rows=P.timeline(s,5,0);assert.equal(rows[3].playable,false);assert.match(P.warnings(s,5),/範囲外/);
});
test('audio metadata validates unique identity and signed numeric offsets',()=>{
  const s=copy();s.audioSources=[{id:'a',name:'原曲',offset:-2.25}];P.validate(s);
  s.audioSources.push({...s.audioSources[0]});assert.throws(()=>P.validate(s),/音源ID/);
  s.audioSources.pop();s.audioSources[0].offset='2';assert.throws(()=>P.validate(s),/補正値/);
});
test('audio interval stops and seeking/reset clears old stop', () => {
  global.document = {addEventListener(){}}; global.window = {addEventListener(){}};
  global.cancelAnimationFrame = () => {}; global.requestAnimationFrame = () => 1;
  const audio = {currentTime: 0, paused: true, addEventListener(){}, removeEventListener(){}, removeAttribute(){}, load(){}, pause(){this.paused = true;}, play(){this.paused = false; return Promise.resolve();}};
  const engine = new P.AudioController(audio, () => {}, message => assert.fail(message)); engine.ready = true;
  engine.play(3, 5.5); audio.currentTime = 5.55; engine.tick();
  assert.equal(audio.paused, true); assert.equal(audio.currentTime, 5.5); assert.equal(engine.stopAt, null);
  engine.play(0, 2.5); engine.seek(4); audio.currentTime = 4; engine.tick(); assert.equal(audio.paused, false);
  engine.reset(); assert.equal(engine.ready, false); assert.equal(engine.stopAt, null);
});
