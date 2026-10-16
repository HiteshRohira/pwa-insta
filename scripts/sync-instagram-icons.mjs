import {readFile, writeFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import {unseal} from '../server/session.mjs';
const setup=await fetch('http://localhost:4310/api/setup').then(r=>r.json());
const cookies=unseal(new URL(setup.phoneUrl).hash.slice(9),'transfer');
const html=await fetch('https://www.instagram.com/',{headers:{Cookie:cookies.map(c=>c.name+'='+c.value).join('; ')}}).then(r=>r.text());
const urls=new Set();
function collect(v){if(!v||typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(k==='src'&&typeof x==='string'&&x.startsWith('https://static.cdninstagram.com/')&&x.includes('.js'))urls.add(x);if(x&&typeof x==='object')collect(x);}}
for(const m of html.matchAll(/<script\b[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs)){try{collect(JSON.parse(m[1]));}catch{}}
for(const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)){if(m[1].includes("cdninstagram.com"))urls.add(m[1].replaceAll("&amp;","&"));}
const glyphs={};
function extract(name,module){let ast;try{ast=parse(module);}catch{return;}const nodes=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&['jsx','jsxs'].includes(node.callee?.property?.name)&&['path','circle','rect','line','polygon','polyline','ellipse'].includes(node.arguments?.[0]?.value)){const attrs={};for(const p of node.arguments[1]?.properties || []){const key=p.key?.name || p.key?.value;const value=p.value?.value;if(key!=='children'&&key!=='key'&&['string','number'].includes(typeof value))attrs[key]=value;}nodes.push({tag:node.arguments[0].value,attrs});}for(const v of Object.values(node)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);if(nodes.length)glyphs[name.replace('.react','')]=nodes;}
try{for(const [name,code] of Object.entries(JSON.parse(await readFile("/tmp/pwa-insta-icon-modules.json","utf8"))))extract(name,code);}catch{}
const list=[...urls];
for(let i=0;i<list.length;i+=6){await Promise.all(list.slice(i,i+6).map(async u=>{try{const code=await fetch(u,{signal:AbortSignal.timeout(15000)}).then(r=>r.text());for(const m of code.matchAll(/__d\("(IGDS[^" ]*Icon.react)"/g)){const end=code.indexOf('__d(',m.index+4);extract(m[1],code.slice(m.index,end<0?undefined:end));}}catch{}}));}
await writeFile('src/instagram-icons.json',JSON.stringify(glyphs)+'\n');
console.log('Official Instagram glyphs:',Object.keys(glyphs).filter(n=>/Heart|Comment|Save|Bookmark|Play|Pause|Volume|Sound|Repost|Reel|Home|Grid|Verify|Verified/.test(n)));
const manifest=await fetch('https://www.instagram.com/data/manifest.json').then(r=>r.json());
console.log('Official icon sizes:',manifest.icons?.map(i=>i.sizes));
const icon=[...(manifest.icons || [])].sort((a,b)=>parseInt(b.sizes)-parseInt(a.sizes))[0];
if(icon){const assetUrl=new URL(icon.src,'https://www.instagram.com/');const r=await fetch(assetUrl);if(r.ok){await writeFile('public/instagram-app-icon.png',Buffer.from(await r.arrayBuffer()));console.log('Saved official app icon:',icon.sizes);}}
