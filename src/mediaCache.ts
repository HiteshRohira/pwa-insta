// Private, bounded on-device media cache. Never cache authentication or API JSON here.
const CACHE='instagram-private-reels-v1';
const LIMIT=512*1024*1024;
const MAX_FILE=32*1024*1024;
const MAX_AGE=30*60*1000;
let generation=0;
let queue:Promise<void>=Promise.resolve();
const warming=new Set<string>();
const controllers=new Map<string,AbortController>();
let wanted=new Set<string>();
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const c of controllers.values())c.abort();});
async function open(){return 'caches' in window?caches.open(CACHE):null;}
export async function cleanMediaCache(){
 try{const cache=await open();if(!cache)return;const rows=[];for(const request of await cache.keys()){const response=await cache.match(request);if(!response)continue;const size=Number(response.headers.get('x-cache-size'));const time=Number(response.headers.get('x-cache-time'));if(!size||Date.now()-time>MAX_AGE){await cache.delete(request);continue;}rows.push({request,size,time});}rows.sort((a,b)=>a.time-b.time);let bytes=rows.reduce((n,r)=>n+r.size,0);for(const row of rows){if(bytes<=LIMIT)break;await cache.delete(row.request);bytes-=row.size;}}catch{/* Storage may be unavailable in private browsing. */}
}
export async function clearMediaCache(){generation++;for(const c of controllers.values())c.abort();controllers.clear();warming.clear();try{await caches.delete(CACHE);}catch{}}
export async function cachedVideoSource(src:string){
 try{const cache=await open();const response=await cache?.match(src);if(response){if(Date.now()-Number(response.headers.get('x-cache-time'))>MAX_AGE){await cache?.delete(src);}else return URL.createObjectURL(await response.blob());}}catch{}return src;
}
export function warmReels(sources:string[]){
 wanted=new Set(sources);for(const [src,c] of controllers)if(!wanted.has(src))c.abort();
 for(const src of sources){if(!src||!src.startsWith('/api/media?')||warming.has(src))continue;warming.add(src);const started=generation;
 queue=queue.then(async()=>{if(!wanted.has(src)||started!==generation||document.hidden||!navigator.onLine)return;const connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection;if(connection?.saveData)return;const controller=new AbortController();controllers.set(src,controller);try{const cache=await open();if(!cache)return;const hit=await cache.match(src);if(hit&&Date.now()-Number(hit.headers.get('x-cache-time'))<MAX_AGE)return;const response=await fetch(src,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});if(!response.ok||!response.headers.get('content-type')?.startsWith('video/'))return;const declared=Number(response.headers.get('content-length'));if(declared>MAX_FILE){controller.abort();return;}const reader=response.body?.getReader();if(!reader)return;const chunks:Uint8Array<ArrayBuffer>[]=[];let bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_FILE||started!==generation){controller.abort();return;}chunks.push(value);}if(started!==generation)return;const headers=new Headers(response.headers);headers.set('x-cache-time',String(Date.now()));headers.set('x-cache-size',String(bytes));headers.delete('content-encoding');headers.delete('content-range');const blob=new Blob(chunks,{type:response.headers.get('content-type')!});try{await cache.put(src,new Response(blob,{status:200,headers}));}catch{const keys=await cache.keys();for(const key of keys.slice(0,Math.max(1,Math.ceil(keys.length/4))))await cache.delete(key);if(started===generation)try{await cache.put(src,new Response(blob,{status:200,headers}));}catch{}}await cleanMediaCache();}catch{}finally{controllers.delete(src);}}).catch(()=>{}).finally(()=>warming.delete(src));
 }
}
void cleanMediaCache();
export async function mediaCacheUsage(){await cleanMediaCache();try{const cache=await open();let bytes=0;for(const key of await cache?.keys() ?? [])bytes+=Number((await cache?.match(key))?.headers.get('x-cache-size') ?? 0);return bytes;}catch{return 0;}}
