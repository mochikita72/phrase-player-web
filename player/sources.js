/* Audio management shared by the player and editor. Files remain local. */
(function(root){
  'use strict';
  let serial=0;
  function probe(file) {
    if(!/\.(wav|mp3)$/i.test(file.name || '')) return Promise.reject(new Error('音源はWAV／MP3を選択してください。'));
    return new Promise((resolve,reject)=>{
      const audio=document.createElement('audio'), url=URL.createObjectURL(file);
      const finish=(error)=>{clearTimeout(timer);audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};
      let duration;const timer=setTimeout(()=>finish(new Error('音源の読み込みが完了しません。ファイルを確認してください。')),20000);
      audio.preload='metadata';audio.onloadedmetadata=()=>{duration=audio.duration;finish(Number.isFinite(duration)&&duration>0?null:new Error('音源の長さを読み取れません。'));};
      audio.onerror=()=>finish(new Error('音源を読み込めません。別のWAV／MP3を選択してください。'));audio.src=url;
    });
  }
  function selected(record) { return record?.audios.find(a=>a.id===record.activeAudioId) || record?.audios[0] || null; }
  async function add(record,file,targetId) {
    const duration=await probe(file);
    let source=record.audios.find(a=>a.id===targetId);
    if(!source) {source={id:`audio-${Date.now().toString(36)}-${++serial}`,name:file.name.replace(/\.[^.]+$/,''),offset:0};record.audios.push(source);}
    Object.assign(source,{file,fileName:file.name,duration});record.activeAudioId=source.id;return source;
  }
  function mount({container,select,record,onChange,onSwitch,onError}) {
    let loading=false;
    select.addEventListener('change',()=>onSwitch(select.value));
    function render() {
      const value=record();container.replaceChildren();select.replaceChildren();
      const audios=value?.audios || [];
      for(const source of audios) {
        const option=document.createElement('option');option.value=source.id;option.textContent=source.name+(source.file?'':'（ファイル未登録）');select.append(option);
        const row=document.createElement('div');row.className='source-row';
        const nameLabel=document.createElement('label');nameLabel.textContent='音源名';const name=document.createElement('input');name.type='text';name.value=source.name;nameLabel.append(name);
        name.addEventListener('change',()=>{if(!name.value.trim()){onError('音源名を入力してください。');name.value=source.name;return;}source.name=name.value.trim();onChange('metadata');render();});
        const offsetLabel=document.createElement('label');offsetLabel.textContent='補正（秒・正負可）';const offset=document.createElement('input');offset.type='number';offset.step='0.001';offset.value=source.offset;offsetLabel.append(offset);
        offset.addEventListener('change',()=>{if(offset.value===''||!Number.isFinite(Number(offset.value))){onError('補正値は数値にしてください。');offset.value=source.offset;return;}const before=selected(value)?.offset||0;source.offset=Number(offset.value);onChange('offset',before);});
        const label=document.createElement('label');label.textContent=source.fileName?`差し替え：${source.fileName}`:'音源ファイルを登録';const input=document.createElement('input');input.type='file';input.accept='.wav,.mp3,audio/wav,audio/mpeg';label.append(input);
        input.addEventListener('change',()=>importFile(input,source.id));
        const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='この音源を削除';
        remove.addEventListener('click',()=>{if(!confirm(`音源「${source.name}」を端末の曲から外しますか？元ファイルは削除しません。`))return;value.audios=value.audios.filter(a=>a.id!==source.id);if(value.activeAudioId===source.id)value.activeAudioId=value.audios[0]?.id||'';onChange('file');render();});
        row.append(nameLabel,offsetLabel,label,remove);container.append(row);
      }
      const label=document.createElement('label');label.textContent='音源を追加（WAV／MP3）';const input=document.createElement('input');input.type='file';input.accept='.wav,.mp3,audio/wav,audio/mpeg';input.disabled=!value;label.append(input);container.append(label);
      input.addEventListener('change',()=>importFile(input));
      select.value=value?.activeAudioId || audios[0]?.id || '';select.disabled=!audios.length || loading;
    }
    async function importFile(input,id) {
      const file=input.files[0];if(!file || loading)return;loading=true;input.disabled=true;
      const target=record();
      try {await add(target,file,id);if(record()===target){onChange('file');render();}}
      catch(e){onError(e.message);}finally{loading=false;input.disabled=false;input.value='';render();}
    }
    return {render};
  }
  root.Sources={probe,selected,add,mount};
})(globalThis);
