(function(root){
  'use strict';
  let serial = 0;
  function id(song) {
    const used = new Set(song.sections.flatMap(s => s.phrases.map(p => p.id)));
    let value; do { value = `p-${Date.now().toString(36)}-${(++serial).toString(36)}`; } while(used.has(value));
    return value;
  }
  function split(song, sectionIndex, index, position) {
    const list = song.sections[sectionIndex].phrases, p = list[index];
    if (position <= 0 || position >= p.text.length || !p.text.slice(0, position).trim() || !p.text.slice(position).trim()) throw new Error('歌詞の途中にカーソルを置いてください。');
    const left = {id:id(song), text:p.text.slice(0, position), start:p.start ?? null};
    const right = {id:id(song), text:p.text.slice(position), start:null};
    list.splice(index, 1, left, right); return left;
  }
  function merge(song, sectionIndex, index) {
    const list = song.sections[sectionIndex].phrases, p = list[index], next = list[index + 1];
    if (!next) throw new Error('同じセクションに次のフレーズがありません。');
    const result = {id:id(song), text:`${p.text}\n${next.text}`, start:p.start ?? null};
    list.splice(index, 2, result); return result;
  }
  const api = {id, split, merge}; root.EditorModel = api;
  if(typeof module !== 'undefined') module.exports = api;
})(globalThis);
