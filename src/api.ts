import { clearMediaCache } from './mediaCache';
import { useCallback, useEffect, useState, type SetStateAction } from 'react';
const cache = new Map<string, {data: unknown; expires: number}>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
export function clearResourceCache(){ generation++; cache.clear(); pending.clear(); }
export async function api<T>(path:string,signal?:AbortSignal,method='GET',body?:unknown):Promise<T>{const r=await fetch('/api/'+path,{signal,method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error || 'Could not load this content.');if(method==='POST')updateActionCache(path,body,d);if(method==='POST'&&(['session','connect','disconnect'].includes(path)||(['login/password','login/two-factor'].includes(path)&&d.step==='authenticated'))){clearResourceCache();await clearMediaCache();}return d;}

function updateActionCache(path:string,body:unknown,result:unknown){
 const intent=body as {liked?:boolean};const receipt=result as {liked?:boolean};
 if(path.startsWith('comments/')){for(const key of cache.keys())if(key.startsWith('comments/'))cache.delete(key);return;}
 if(!path.startsWith('likes/')&&!path.startsWith('comment-likes/'))return;
 const id=path.split('/')[1];const comment=path.startsWith('comment-likes/');const liked=receipt.liked??intent.liked;
 const update=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(update);if(!value||typeof value!=='object')return value;const obj=value as Record<string,unknown>;if(obj.id===id&&typeof obj.likes==='number'&&(comment?'text'in obj:'kind'in obj))return {...obj,liked,likes:Math.max(0,obj.likes+(liked?1:0)-(obj.liked?1:0))};return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,update(v)]));};
 for(const [key,entry]of cache)if(comment?key.startsWith('comments/'):!key.startsWith('comments/'))cache.set(key,{...entry,data:update(entry.data)});
}

export function prefetchResource<T>(key:string):Promise<T>{
 const hit=cache.get(key);if(hit&&hit.expires>Date.now())return Promise.resolve(hit.data as T);
 const inFlight=pending.get(key);if(inFlight)return inFlight as Promise<T>;
 const started=generation;
 const task=api<T>(key).then(data=>{if(started===generation){cache.set(key,{data,expires:Date.now()+120_000});if(cache.size>30)cache.delete(cache.keys().next().value!);}return data;}).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
 pending.set(key,task);return task;
}
export function useResource<T>(key:string | null,demo:T | null){
 const [state,setState]=useState<{key:string|null;data:T|null;loading:boolean;error:string}>({key:null,data:null,loading:false,error:''});const [version,setVersion]=useState(0);
 const setData=useCallback((update:SetStateAction<T|null>)=>setState(current=>{const previous=current.key===key?current.data:(key?cache.get(key)?.data as T:null);const data=typeof update==='function'?(update as (previous:T|null)=>T|null)(previous ?? null):update;if(key&&data)cache.set(key,{data,expires:Date.now()+120_000});return {key,data,loading:false,error:''};}),[key]);
 useEffect(()=>{if(!key)return;let disposed=false;const hit=cache.get(key);if(hit&&hit.expires>Date.now())setState({key,data:hit.data as T,loading:false,error:''});else setState({key,data:null,loading:true,error:''});prefetchResource<T>(key).then(data=>{if(!disposed)setState({key,data,loading:false,error:''});}).catch(e=>{if(!disposed)setState({key,data:null,loading:false,error:e.message});});return()=>{disposed=true;};},[key,version]);
 const current=state.key===key;const hit=key?cache.get(key):null;const cached=hit&&hit.expires>Date.now()?hit.data as T:null;
 return {data:key?(current?state.data:cached):demo,setData,loading:!!key&&(current?state.loading:!cached),error:key&&current?state.error:'',reload:useCallback(()=>{if(key)cache.delete(key);setVersion(v=>v+1);},[key])};
}
