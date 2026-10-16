import { unseal } from '../server/session.mjs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
await mkdir('/tmp/pwa-insta-query-modules',{recursive:true});
const setup=await fetch('http://localhost:4310/api/setup').then(r=>r.json());
if(!setup.phoneUrl)throw new Error('Connect the local Instagram session first.');
const cookies=unseal(new URL(setup.phoneUrl).hash.slice(9),'transfer');
const header=cookies.map(c=>c.name+'='+c.value).join('; ');
const html=await fetch('https://www.instagram.com'+(process.argv[2] || '/'),{headers:{Cookie:header,'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}}).then(r=>r.text());
const urls=new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')));
function walk(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(k==='src'&&typeof x==='string'&&x.includes('/rsrc.php/')&&x.includes('.js'))urls.add(x);if(x&&typeof x==='object')walk(x);}}
for(const match of html.matchAll(/<script\b[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs)){try{walk(JSON.parse(match[1]));}catch{}}
let operations={};try{operations=JSON.parse(await readFile('server/operations.json','utf8'));}catch{}const list=[...urls].filter(x=>x.startsWith('https://')&&new URL(x).hostname.endsWith('.cdninstagram.com'));console.log('Inspecting public script bundles:',list.length);
let n=0;
for(let offset=0;offset<list.length;offset+=5){await Promise.all(list.slice(offset,offset+5).map(async url=>{try{const code=await fetch(url,{signal:AbortSignal.timeout(20000)}).then(r=>r.text());if(/PolarisStoriesV3TrayContainerQuery|PolarisFeedTimelineRootV2Query|PolarisClipsTabRootPaginationQuery|PolarisProfilePageContentQuery|PolarisPostComments|PolarisPostChildComments/.test(code))await writeFile('/tmp/pwa-insta-query-modules/'+url.split('/').at(-1).split('?')[0],code);
 for(const m of code.matchAll(/__d\("(Polaris[^"\s]*(?:Query|Subscription)[^"\s]*)"/g)){const end=code.indexOf('__d(',m.index+4);const module=code.slice(m.index,end===-1?undefined:end);const id=module.match(/exports="(\d{10,})"/) || module.match(/\bid:"(\d{10,})"/);const name=m[1].replace(/(?:\.graphql|_instagramRelayOperation)$/,'');if(/Feed|Reels|Stories|Story|Comments|Profile|Search|Explore|Clips/.test(name)){const previous=operations[name] || {};operations[name]={...previous,...(id?{id:id[1]}:{}),...(m[1].endsWith('.graphql')?{arguments:[...module.matchAll(/kind:"LocalArgument",name:"([^"]+)"/g)].map(m=>m[1]),fields:[...new Set([...module.matchAll(/name:"(xdt[^"\s]+)"/g)].map(m=>m[1]))]}:{})};}}

 n++;}catch{}}));}
await writeFile('server/operations.json',JSON.stringify(operations,null,2)+'\n');console.log('Public query IDs found:',Object.keys(operations));
