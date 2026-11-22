// Optional, one-time download of pinned OCR assets. No npm install or build needed.
const fs = require('node:fs/promises');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const {createHash} = require('node:crypto');
const root = path.join(__dirname, 'editor/vendor');
const packages = [
  ['tesseract.js', '6.0.1', name => /^(dist\/(tesseract|worker)\.min\.js|LICENSE\.md)$/.test(name) ? `tesseract/${path.basename(name)}` : null],
  ['tesseract.js-core', '6.0.0', name => /^(tesseract-core.*\.(wasm|wasm\.js)|LICENSE)$/.test(name) ? `core/${name}` : null],
  ...['jpn', 'eng'].map(lang => [`@tesseract.js-data/${lang}`, '1.0.0', name => name === `4.0.0_best_int/${lang}.traineddata.gz` ? `lang/${lang}.traineddata.gz` : /license/i.test(name) ? `lang/${lang}-${path.basename(name)}` : null]),
];
async function download(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status}: ${url}`); return Buffer.from(await response.arrayBuffer()); }
(async () => {
  for (const [name, version, select] of packages) {
    const meta = JSON.parse((await download(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`)).toString());
    const archive = await download(meta.dist.tarball);
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
    if (integrity !== meta.dist.integrity) throw new Error(`Integrity mismatch: ${name}`);
    const tar = gunzipSync(archive); let count = 0;
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      const entry = header.subarray(0,100).toString().replace(/\0.*$/s, '');
      if (!entry) break;
      const size = parseInt(header.subarray(124,136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
      const destination = select(entry.replace(/^package\//, ''));
      if (destination && (header[156] === 48 || header[156] === 0)) {
        const target = path.join(root, destination);
        await fs.mkdir(path.dirname(target), {recursive:true});
        await fs.writeFile(target, tar.subarray(offset + 512, offset + 512 + size)); count++;
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    if (!count) throw new Error(`No assets found: ${name}`);
    console.log(`${name}@${version}: ${count} files (SHA-512 verified)`);
  }
  for(const file of ['tesseract/tesseract.min.js','tesseract/worker.min.js','core/tesseract-core-lstm.wasm.js','lang/jpn.traineddata.gz','lang/eng.traineddata.gz']) await fs.access(path.join(root, file));
  console.log('OCR assets ready in editor/vendor.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
