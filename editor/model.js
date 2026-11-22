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
  const hasStart = phrase => Number.isFinite(phrase.start) && phrase.start >= 0;
  function sortSection(section) {
    // Unset rows keep their exact slots. Only timed rows exchange positions.
    const timed = section.phrases.map((phrase,index)=>({phrase,index})).filter(item=>hasStart(item.phrase));
    const ordered = [...timed].sort((a,b)=>a.phrase.start-b.phrase.start || a.index-b.index);
    let changed=false;
    timed.forEach((item,i)=>{if(section.phrases[item.index]!==ordered[i].phrase)changed=true;section.phrases[item.index]=ordered[i].phrase;});
    return changed;
  }
  function sectionWarnings(song) {
    const warnings=[];let previous=null;
    for(const section of song.sections){
      const values=section.phrases.filter(hasStart).map(p=>p.start);
      if(!values.length)continue;
      const min=Math.min(...values),max=Math.max(...values);
      if(previous && min<=previous.max)warnings.push(`「${section.name}」の開始時刻が前のセクション「${previous.name}」の時刻以前です。セクション順は変更せず、時刻または所属セクションを確認してください。`);
      if(!previous || max>previous.max)previous={name:section.name,max};
    }
    return warnings.join('\n');
  }
  function moveBoundary(song, target, phraseId) {
    if(!Number.isInteger(target)||target<=0||target>=song.sections.length)throw new Error('先頭以外のセクションを選択してください。');
    const rows=song.sections.flatMap(s=>s.phrases),starts=[];let total=0;
    for(const section of song.sections){starts.push(total);total+=section.phrases.length;}starts.push(total);
    const position=rows.findIndex(p=>p.id===phraseId);
    if(position<0)throw new Error('フレーズを選択してください。');
    // Clamp crossed boundaries; retain objects and sort timed slots within each new section.
    starts[target]=position;
    for(let i=1;i<target;i++)starts[i]=Math.min(starts[i],position);
    for(let i=target+1;i<song.sections.length;i++)starts[i]=Math.max(starts[i],position);
    song.sections.forEach((section,i)=>{section.phrases=rows.slice(starts[i],starts[i+1]);sortSection(section);});
  }
  function moveSection(song,index,direction){
    const target=index+direction;
    if(!song.sections[index]||!song.sections[target]||Math.abs(direction)!==1)return index;
    const [section]=song.sections.splice(index,1);song.sections.splice(target,0,section);return target;
  }
  function removeSection(song,index,target){
    if(song.sections.length===1)throw new Error('セクションは1つ以上必要です。');
    const section=song.sections[index];if(!section)throw new Error('セクションが見つかりません。');
    if(section.phrases.length){
      if(index===target||!song.sections[target])throw new Error('フレーズの移動先を選択してください。');
      song.sections[target].phrases.push(...section.phrases);sortSection(song.sections[target]);
    }
    song.sections.splice(index,1);
  }
  function adjustStart(phrase,delta){
    if(!hasStart(phrase))throw new Error('先に開始時刻を設定してください。');
    // Decimal arithmetic avoids accumulating binary floating-point artifacts.
    const [coefficient,exponent='0']=String(phrase.start).split('e');
    const decimals=(coefficient.split('.')[1]||'').length;
    const scale=Math.max(1,decimals-Number(exponent));
    const digits=BigInt(coefficient.replace('.',''))*10n**BigInt(Math.max(0,Number(exponent)-decimals+scale));
    const next=digits+(delta<0?-1n:1n)*10n**BigInt(scale-1);
    phrase.start=next<0n?0:Number(next)/10**scale;return phrase.start;
  }
  const api = {id, split, merge, sortSection, sectionWarnings, moveBoundary, moveSection, removeSection, adjustStart}; root.EditorModel = api;
  if(typeof module !== 'undefined') module.exports = api;
})(globalThis);
