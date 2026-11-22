// Optional development server. Node built-ins only; private data is never served.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.gz':'application/gzip'};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if(pathname === '/') { res.writeHead(302, {Location:'/player/'}).end(); return; }
  if(pathname.endsWith('/')) pathname += 'index.html';
  const asset = /^\/editor\/vendor\/(tesseract\/(tesseract|worker)\.min\.js|core\/tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?|lang\/(jpn|eng)\.traineddata\.gz)$/.test(pathname);
  if(!asset && !/^\/(player|editor)\/[a-z-]+\.(html|css|js)$/.test(pathname)) { res.writeHead(404).end(); return; }
  fs.readFile(path.join(__dirname, pathname), (err, data) => {
    if(err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(pathname)], 'Cache-Control':'no-store'}).end(data);
  });
});
server.listen(4173, process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('Player: http://127.0.0.1:4173/player/\nEditor: http://127.0.0.1:4173/editor/');
  if(process.argv.includes('--lan')) for(const addresses of Object.values(os.networkInterfaces())) for(const address of addresses) {
    if(address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) console.log(`LAN: http://${address.address}:4173/player/  |  http://${address.address}:4173/editor/`);
  }
});
