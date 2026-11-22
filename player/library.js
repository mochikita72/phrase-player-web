/* Shared browser-local records. No network requests. */
(function(root) {
  'use strict';
  const DB_NAME = 'vocal-phrase-library-v1';
  function storageError(error) {
    if (error?.name === 'QuotaExceededError') return new Error('端末の保存容量が不足しています。不要な保存曲を削除するか、端末の空き容量を確認してください。編集内容は画面に残っています。');
    if (['SecurityError','InvalidStateError','NotAllowedError'].includes(error?.name)) return new Error('このブラウザでは端末内保存が利用できません。プライベートモード・サイトの保存設定を確認してください。JSONと元音源を保存してご利用ください。');
    return new Error(error?.message || '端末内データの読み書きに失敗しました。再試行してください。');
  }
  let opening;
  function open() {
    if (!root.indexedDB) return Promise.reject(storageError({name:'SecurityError'}));
    if (!opening) opening = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(DB_NAME, 1); } catch(e) { reject(storageError(e)); return; }
      request.onupgradeneeded = () => {
        request.result.createObjectStore('songs', {keyPath:'id'});
        request.result.createObjectStore('meta');
      };
      let blocked = false;
      request.onblocked = () => { blocked = true; reject(new Error('別のタブが保存領域を使用しています。このアプリの他のタブを閉じて再試行してください。')); };
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
    }).catch(e => { opening = null; throw e; });
    return opening;
  }
  async function transaction(stores, mode, action) {
    const db = await open();
    return new Promise((resolve,reject) => {
      let tx, result, failure;
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(storageError(failure || tx.error));
        tx.onerror = event => { failure ||= event.target.error || tx.error; };
        action(tx, value => {result = value;}, error => {failure = error; tx.abort();});
      } catch(e) { if(tx) {failure=e; try{tx.abort();}catch{reject(storageError(e));}} else reject(storageError(e)); }
    });
  }
  const get = id => transaction(['songs'],'readonly',(tx,done)=>{const r=tx.objectStore('songs').get(id);r.onsuccess=()=>done(r.result || null);});
  const list = () => transaction(['songs'],'readonly',(tx,done)=>{const r=tx.objectStore('songs').getAll();r.onsuccess=()=>done(r.result.map(x=>({id:x.id,title:x.song.title,artist:x.song.artist,revision:x.revision})));});
  const last = () => transaction(['meta'],'readonly',(tx,done)=>{const r=tx.objectStore('meta').get('last');r.onsuccess=()=>done(r.result || null);});
  const remember = id => transaction(['meta'],'readwrite',tx=>tx.objectStore('meta').put(id,'last'));
  async function save(record) {
    const exported=exportSong(record);Phrase.validate(exported);
    const expected=record.revision || 0;
    const snapshot = {...structuredClone(record), id:record.song.songId, song:exported, revision:expected+1};
    return transaction(['songs','meta'],'readwrite',(tx,done,abort)=>{
      const store=tx.objectStore('songs'), request=store.get(snapshot.id);
      request.onsuccess=()=>{
        try {
          if ((request.result?.revision || 0) !== expected) { abort(new Error('この曲は別の画面で更新・削除されています。同じIDの新規登録もできません。JSONをバックアップしてから保存曲を読み直してください。')); return; }
          store.put(snapshot); tx.objectStore('meta').put(snapshot.id,'last'); done(snapshot);
        } catch(e) {abort(e);}
      };
    });
  }
  const remove = (id, revision) => transaction(['songs','meta'],'readwrite',(tx,done,abort)=>{
    const store=tx.objectStore('songs'), r=store.get(id);
    r.onsuccess=()=>{
      if (r.result && r.result.revision !== revision) { abort(new Error('この曲は別の画面で更新されています。一覧を読み直してください。')); return; }
      store.delete(id); const m=tx.objectStore('meta').get('last'); m.onsuccess=()=>{if(m.result===id) tx.objectStore('meta').delete('last');};
    };
  });
  function exportSong(record) {
    const song = structuredClone(record.song);
    song.audioSources = record.audios.map(({id,name,offset})=>({id,name,offset}));
    for (const p of Phrase.flatten(song)) delete p.end;
    return song;
  }
  function fromSong(song, previous = null) {
    const sources = [...(song.audioSources || [])];
    for(const source of previous?.audios || [])if(!sources.some(a=>a.id===source.id))sources.push({id:source.id,name:source.name,offset:source.offset});
    const audios = sources.map(source=>({...previous?.audios.find(a=>a.id===source.id),...source}));
    return {id:song.songId,song:structuredClone(song),audios,activeAudioId:previous?.activeAudioId || audios[0]?.id || '',revision:previous?.revision || 0};
  }
  function filename(title,date=new Date()) {
    const pad=n=>String(n).padStart(2,'0');
    const name=(title.trim().replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'無題の曲');
    return `${name}_${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
  }
  function download(record) {
    const song=exportSong(record); Phrase.validate(song);
    const url=URL.createObjectURL(new Blob([JSON.stringify(song,null,2)],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=filename(song.title);
    try{document.body.append(a);a.click();} finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  }
  async function saveBoth(record) {
    // Start the download synchronously while the user's click is still active (Safari).
    let jsonStarted=false, jsonError='', saved=null, dbError='';
    try { download(record); jsonStarted=true; } catch(e) {jsonError=e.message;}
    try { saved=await save(record); } catch(e) {dbError=e.message;}
    return {jsonStarted,jsonError,saved,dbError,message:[jsonStarted?'JSONのダウンロードを開始。保存先を確認してください。':`JSON書き出し失敗：${jsonError}`,saved?'端末内データは更新済み。JSONの保存完了は未確認です。':`端末内保存に失敗：${dbError}`,Phrase.warnings(record.song)].filter(Boolean).join('\n')};
  }
  const api={get,list,last,remember,save,remove,fromSong,exportSong,download,saveBoth,storageError,filename};
  root.Library=api; if(typeof module!=='undefined') module.exports=api;
})(globalThis);
