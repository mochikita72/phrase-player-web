const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../player/common.js');
const M = require('../editor/model.js');
const source = require('../samples/sample-song.json');
test('split and merge allocate unique IDs, preserve song identity, and round-trip', () => {
  const song = structuredClone(source), old = song.sections[0].phrases[0].id;
  M.split(song, 0, 0, 4);
  const left = song.sections[0].phrases[0], right = song.sections[0].phrases[1];
  assert.notEqual(left.id, old); assert.notEqual(right.id, old); assert.notEqual(left.id, right.id);
  assert.equal(right.start, null);assert.equal(left.end,undefined); P.validate(song, 9);
  const merged = M.merge(song, 0, 0);
  assert.notEqual(merged.id, left.id); assert.notEqual(merged.id, right.id);
  assert.equal(merged.start, 0); assert.equal(merged.end, undefined);
  assert.equal(song.songId, source.songId); assert.equal(song.sections[1].phrases[0].id, 'p003');
  assert.deepEqual(P.parse(JSON.stringify(song), 9), song);
});
test('unfinished times survive splitting and export', () => {
  const song = structuredClone(source); song.sections[0].phrases[0].start = null;
  M.split(song, 0, 0, 3); P.validate(song);
  assert.equal(song.sections[0].phrases[0].start, null);
});
test('invalid split or merge does not mutate data', () => {
  const song = structuredClone(source);
  assert.throws(() => M.split(song, 0, 0, 0), /カーソル/);
  assert.throws(() => M.merge(song, 1, 0), /次のフレーズ/);
  assert.deepEqual(song, source);
});
test('timed rows sort into timed slots, leaving unset rows exactly in place',()=>{
  const rows=[{id:'a',start:10},{id:'u',start:null},{id:'b',start:20},{id:'v'},{id:'c',start:30},{id:'music',text:'♪',start:15}];
  const section={name:'A',phrases:[...rows]};assert.equal(M.sortSection(section),true);
  assert.deepEqual(section.phrases.map(p=>p.id),['a','u','music','v','b','c']);
  assert.equal(section.phrases[1],rows[1]);assert.equal(section.phrases[3],rows[3]);assert.equal(section.phrases[2],rows[5]);
  assert.equal(M.sortSection(section),false);
});
test('equal start values keep their prior relative order; clearing a start fixes its current slot',()=>{
  const section={phrases:[{id:'x',start:20},{id:'a',start:10},{id:'b',start:10},{id:'y',start:30}]};
  M.sortSection(section);assert.deepEqual(section.phrases.map(p=>p.id),['a','b','x','y']);
  section.phrases[1].start=null;section.phrases[3].start=0;M.sortSection(section);
  assert.deepEqual(section.phrases.map(p=>p.id),['y','b','a','x']);
});
test('cross-section warning skips empty sections without moving rows or sections',()=>{
  const song={sections:[{name:'A',phrases:[{id:'a',start:30}]},{name:'空',phrases:[{id:'u',start:null}]},{name:'B',phrases:[{id:'b',start:20}]}]};
  const before=structuredClone(song);assert.match(M.sectionWarnings(song),/「B」.*「A」/);assert.deepEqual(song,before);
  song.sections[2].phrases[0].start=40;assert.equal(M.sectionWarnings(song),'');
});
