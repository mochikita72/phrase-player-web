const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['serve.cjs','setup-ocr.cjs',...['player','editor','scripts','tests'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>/\.(js|cjs)$/.test(f)).map(f=>dir+'/'+f))];
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
for(const page of ['player/index.html','editor/index.html']){const html=fs.readFileSync(path.join(root,page),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ID: '+page);}
console.log('Syntax and HTML IDs OK');
