/* Editor-only OCR. Images and recognized text never leave this browser. */
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  let imageDraft = false;
  let imageFile = null, imageURL = null, selection = 0, job = null, library = null;
  const say = text => { get('ocr-status').textContent = text; };
  function busy(value) {
    get('ocr-start').disabled = value || !imageFile;
    get('ocr-cancel').hidden = !value; get('ocr-progress').hidden = !value;
    get('ocr-file').disabled = value;
    get('ocr-paste').setAttribute('aria-busy', String(value));
  }
  function loadLibrary() {
    if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = new URL('vendor/tesseract/tesseract.min.js', document.baseURI).href;
      script.onload = () => resolve(globalThis.Tesseract);
      script.onerror = () => { script.remove(); library = null; reject(new Error('OCRファイルを読み込めません。READMEのOCR準備手順を確認してください。')); };
      document.head.append(script);
    });
    return library;
  }
  async function choose(file) {
    if (job) { say('文字起こし中です。画像を変更するには先に中止してください。'); return; }
    const ticket = ++selection;
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) { say('PNG・JPEG・WebPの画像を選択してください。'); return; }
    if (file.size > 20 * 1024 * 1024) { say('画像は20MB以下にしてください。歌詞の部分だけ切り取ると読み取りやすくなります。'); return; }
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(new Error('画像を開けません。別の画像を選択してください。')); image.src = url; });
      if (ticket !== selection) { URL.revokeObjectURL(url); return; }
      if (image.naturalWidth * image.naturalHeight > 20000000) throw new Error('画像が大きすぎます。2000万画素以下に切り取ってください。');
      if (imageURL) URL.revokeObjectURL(imageURL);
      imageFile = file; imageURL = url; imageDraft = true;
      get('ocr-image').src = url; get('ocr-image').hidden = false; busy(false);
      say('画像を読み込みました。「文字起こし」を押してください。');
    } catch(error) { URL.revokeObjectURL(url); if(ticket === selection) say(error.message); }
  }
  function cancel(message = '文字起こしを中止しました。再実行できます。') {
    if (!job) return;
    const old = job; job = null; clearTimeout(old.timer);
    old.reject(new Error(message)); if (old.worker) void old.worker.terminate().catch(() => {});
    busy(false); say(message);
  }
  get('ocr-file').addEventListener('change', event => { const file = event.target.files[0]; if(file) void choose(file); event.target.value = ''; });
  document.addEventListener('paste', event => {
    const item = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (item) { event.preventDefault(); void choose(item.getAsFile()); }
  });
  get('ocr-cancel').addEventListener('click', () => cancel());
  get('ocr-start').addEventListener('click', async () => {
    if (job || !imageFile) return;
    if (location.protocol === 'file:') { say('文字起こしはローカルサーバーから開いてください： http://127.0.0.1:4173/editor/'); return; }
    if (get('ocr-result').value.trim() && !confirm('読み取り結果を新しく作り直しますか？必要な内容は先に歌詞欄に追加してください。')) return;
    const task = {worker:null}; job = task; busy(true); get('ocr-progress').value = 0; say('文字起こしを準備しています…');
    const stopped = new Promise((_, reject) => { task.reject = reject; });
    task.timer = setTimeout(() => cancel('時間がかかりすぎたため中止しました。画像を小さくして再実行してください。'), 120000);
    try {
      const work = (async () => {
        const api = await loadLibrary(); if (job !== task) return null;
        const worker = await api.createWorker('jpn+eng', 1, {
          workerPath:new URL('vendor/tesseract/worker.min.js', document.baseURI).href,
          corePath:new URL('vendor/core/', document.baseURI).href,
          langPath:new URL('vendor/lang', document.baseURI).href,
          workerBlobURL:false, cacheMethod:'none',
          logger: event => {
            if(job !== task) return;
            if(event.status === 'recognizing text') { get('ocr-progress').value = event.progress || 0; say(`文字起こし中… ${Math.round((event.progress || 0) * 100)}%`); }
            else say('日本語・英語の読み取りを準備しています…');
          },
          errorHandler: () => task.reject(new Error('文字起こしに失敗しました。画像やOCRファイルを確認して再実行してください。')),
        });
        if(job !== task) { await worker.terminate(); return null; }
        task.worker = worker;
        return worker.recognize(imageFile);
      })();
      const result = await Promise.race([work, stopped]); if(job !== task || !result) return;
      const text = result.data.text.replace(/\r\n?/g,'\n')
        .replace(/([\u3001-\u30ff\u3400-\u9fff])[ \t]+(?=[\u3001-\u30ff\u3400-\u9fff])/g, '$1').trim();
      if(!text) { say('文字が見つかりませんでした。文字を大きく、はっきり写した画像を試してください。'); return; }
      get('ocr-result').value = text; get('ocr-output').hidden = false;
      say('読み取りが完了しました。誤字・改行を修正して「歌詞欄に追加」を押してください。');
    } catch(error) { if(job === task) say(error.message || '文字起こしに失敗しました。再実行してください。'); }
    finally {
      clearTimeout(task.timer);
      if(task.worker) await task.worker.terminate().catch(() => {});
      if(job === task) { job = null; busy(false); }
    }
  });
  get('ocr-append').addEventListener('click', () => {
    const text = get('ocr-result').value.trim(); if(!text) { say('読み取り結果が空です。'); return; }
    const bulk = get('bulk'); bulk.value = [bulk.value.trimEnd(), text].filter(Boolean).join('\n');
    bulk.dispatchEvent(new Event('input', {bubbles:true}));
    get('ocr-result').value = ''; get('ocr-output').hidden = true; imageDraft = false;
    say('歌詞欄に追加しました。改行を確認し「選択セクションに追加」を押してください。'); bulk.focus();
  });
  window.editorOCR={hasDraft:()=>!!(job || imageDraft || get('ocr-result').value.trim())};
  window.addEventListener('beforeunload', event => {
    if(!window.editorLeaving && (job || get('ocr-result').value.trim())) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { cancel(); if(imageURL) URL.revokeObjectURL(imageURL); imageURL = null; imageFile = null; get('ocr-image').hidden = true; busy(false); });
})();
