// Allowlist-only static export. Never copies private files, samples or the ToDo app.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname,'..');
const files = ['index.html','.nojekyll','THIRD-PARTY.md',
  ...['index.html','style.css','common.js','library.js','sources.js','player.js','notes.js','layout.js'].map(f=>`player/${f}`),
  ...['index.html','style.css','model.js','editor.js','ocr.js','layout.js'].map(f=>`editor/${f}`),
  ...['tesseract.min.js','worker.min.js','LICENSE.md'].map(f=>`editor/vendor/tesseract/${f}`),
  ...['','-simd','-lstm','-simd-lstm'].flatMap(s=>['wasm','wasm.js'].map(ext=>`editor/vendor/core/tesseract-core${s}.${ext}`)),
  'editor/vendor/core/LICENSE','editor/vendor/lang/jpn.traineddata.gz','editor/vendor/lang/eng.traineddata.gz',
];
(async()=>{
  for(const file of files) await fs.access(path.join(root,file));
  const output = path.join(root,'dist');
  if(path.dirname(output)!==root || path.basename(output)!=='dist')throw new Error('Unsafe output path');
  await fs.rm(output,{recursive:true,force:true});
  await fs.mkdir(output,{recursive:true});
  for(const file of files){const destination=path.join(output,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,file),destination);}
  // Content-address assets so a cached script cannot be paired with newer markup.
  for(const page of ['player/index.html','editor/index.html']){
    const filename=path.join(output,page);
    let html=await fs.readFile(filename,'utf8');
    for(const match of [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)]){
      const asset=await fs.readFile(path.resolve(path.dirname(filename),match[1]));
      const version=createHash('sha256').update(asset).digest('hex').slice(0,12);
      html=html.replace(match[0],match[0].slice(0,match[0].indexOf('"')+1)+`${match[1]}?v=${version}"`);
    }
    await fs.writeFile(filename,html);
  }
  console.log('Built dist: application and OCR assets only');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
