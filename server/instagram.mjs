import { createHmac, randomBytes } from 'node:crypto';
export class InstagramError extends Error { constructor(message, status = 502, code = 'UPSTREAM') { super(message); this.status = status; this.code = code; } }
export const mediaKey = process.env.SESSION_KEY ? createHmac('sha256',process.env.SESSION_KEY).update('media-signing').digest() : randomBytes(32);
export function validMediaUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['cdninstagram.com','fbcdn.net'].some(d => u.hostname === d || u.hostname.endsWith('.'+d)); } catch { return false; }
}
export function signMedia(url) { return createHmac('sha256', mediaKey).update(url).digest('hex'); }
export function mediaUrl(url) { return validMediaUrl(url) ? `/api/media?url=${encodeURIComponent(url)}&sig=${signMedia(url)}` : ''; }
export function normalizeUser(u = {}) { return { id: String(u.pk ?? u.id ?? ''), username: u.username ?? 'instagram', name: u.full_name ?? '', avatar: mediaUrl(u.profile_pic_url ?? ''), verified: !!u.is_verified }; }
export function normalizeMedia(m = {}, saver = true) {
  const images = m.image_versions2?.candidates ?? [];
  const desired = saver ? 720 : 1080;
  const ordered = [...images].sort((a,b)=>a.width-b.width);
  const image = ordered.find(i=>i.width >= desired) ?? ordered.at(-1);
  const videos = [...(m.video_versions ?? [])].sort((a,b)=>a.width-b.width);
  const video = videos.find(v=>v.width >= (saver ? 480 : 720)) ?? videos.at(-1);
  return { id: String(m.pk ?? m.id ?? ''), code: m.code ?? '', user: normalizeUser(m.user ?? m.owner), image: mediaUrl(image?.url ?? m.display_url ?? ''), video: mediaUrl(video?.url ?? ''), kind: m.media_type === 2 || video ? 'video' : m.media_type === 8 ? 'carousel' : 'image', caption: typeof m.caption === 'string' ? m.caption : m.caption?.text ?? '', likes: m.like_count ?? 0, liked: !!m.has_liked, commentCount: m.comment_count ?? 0, timestamp: m.taken_at ?? 0, location: m.location?.name ?? '', children: (m.carousel_media ?? []).map(c=>normalizeMedia({...c, user:m.user}, saver)) };
}
export function normalizeFeed(data, saver = true) {
  const raw = data.feed_items ?? data.items ?? [];
  const items = raw.flatMap(x => x.media_or_ad ? [x.media_or_ad] : x.media ? [x.media] : x.pk || x.id ? [x] : []).filter(x=>!x.is_ad && !x.ad_id && !x.sponsor_tags);
  return { items: items.map(m=>normalizeMedia(m,saver)), cursor: data.next_max_id ?? data.paging_info?.max_id ?? null, more: !!(data.more_available ?? data.paging_info?.more_available) };
}
export class InstagramClient {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.browserWrites=fetcher===fetch; this.cookies = ''; this.csrf = ''; this.userId = ''; this.cache = new Map(); this.pending = new Map(); this.blockedUntil = 0; this.generation = 0; }
  connect(cookies) {
    const allowed = new Set(['sessionid','csrftoken','ds_user_id','mid','ig_did','rur']);
    const clean = cookies.filter(c=>allowed.has(c.name) && typeof c.value === 'string' && !/[;\r\n]/.test(c.value));
    if (!clean.find(c=>c.name==='sessionid')) throw new InstagramError('No Instagram session cookie was found. Reload the connector with access to instagram.com and try again from your Instagram tab.',400,'LOGIN');
    this.disconnect(); this.cookies = clean.map(c=>`${c.name}=${c.value}`).join('; '); this.csrf = clean.find(c=>c.name==='csrftoken')?.value ?? ''; this.userId = clean.find(c=>c.name==='ds_user_id')?.value ?? decodeURIComponent(clean.find(c=>c.name==='sessionid').value).match(/^\d+/)?.[0] ?? ''; this.sessionCookies=clean;
  }
  disconnect() { this.generation++; this.cookies = ''; this.csrf = ''; this.userId = ''; this.sessionCookies=[]; this.cache.clear(); this.pending.clear(); this.bootstrapData=null; this.webTokens=null; this.bootstrapPending=null; this.authFailure=null; this.blockedUntil = 0; }
  async bootstrap() {
    if(this.authFailure?.expires>Date.now())throw this.authFailure.error;
    if(Date.now()<this.blockedUntil)throw new InstagramError('Instagram asked us to slow down. Try again in a minute.',429,'RATE_LIMITED');
    if(this.bootstrapPending)return this.bootstrapPending;
    const task=this._bootstrap();this.bootstrapPending=task;try{return await task;}catch(error){if(error.code==='LOGIN_REQUIRED'){this.bootstrapData=null;this.authFailure={error,expires:Date.now()+30000};}throw error;}finally{if(this.bootstrapPending===task)this.bootstrapPending=null;}
  }
  async _bootstrap() {
    if (!this.cookies) throw new InstagramError('Connect your Instagram session to continue.',401,'NOT_CONNECTED');
    if(this.bootstrapData?.expires > Date.now())return this.bootstrapData.user;
    const generation=this.generation;
    const r=await this.fetcher('https://www.instagram.com/',{headers:{Cookie:this.cookies,'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!r.ok){if(r.status===429){this.blockedUntil=Date.now()+60000;throw new InstagramError('Instagram asked us to slow down. Try again in a minute.',429,'RATE_LIMITED');}if([301,302,303,307,308,401,403].includes(r.status))throw new InstagramError('Your Instagram session expired or needs approval. Log in again using Settings → Log in on this phone.',401,'LOGIN_REQUIRED');throw new InstagramError('Instagram is temporarily unavailable. Try again shortly.',502,'UPSTREAM');}
    const html=await r.text();let user;const tokens={};
    const walk=(value)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)&&['DTSGInitialData','LSD','CurrentUserInitialData','SiteData','SprinkleConfig','GetAsyncParamsExtraData'].includes(value[0])){const config=value.find(x=>x&&typeof x==='object'&&typeof x.token==='string');if(config)tokens[value[0]]=config.token;if(!['DTSGInitialData','LSD'].includes(value[0]))tokens[value[0]]=value[2];}for(const [k,v] of Object.entries(value)){if(k==='username' && String(value.id)===this.userId && value.profile_pic_url)user=value;if(v&&typeof v==='object')walk(v);}};
    for(const match of html.matchAll(/<script\b[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs)){try{walk(JSON.parse(match[1]));}catch{}}
    if(generation!==this.generation)throw new InstagramError('Session changed. Reconnect.',401,'NOT_CONNECTED');
    if(!user)throw new InstagramError('Instagram needs a fresh sign-in. Use Settings → Log in on this phone.',401,'LOGIN_REQUIRED');
    this.webTokens=tokens;this.bootstrapData={user,expires:Date.now()+300000};return user;
  }
  async graphql(name, docId, variables, ttl=30_000) {
    await this.bootstrap();
    const auth=this.webTokens?.DTSGInitialData;const lsd=this.webTokens?.LSD;
    const mutation=/Mutation$/.test(name);const needsWebTokens=mutation||['PolarisStoriesV3TrayContainerQuery','PolarisPostCommentsPaginationQuery','PolarisPostChildCommentsQuery'].includes(name);
    const send=()=>this.request(needsWebTokens?'/api/graphql':'/graphql/query',{method:'POST',form:{doc_id:docId,fb_api_req_friendly_name:name,variables:JSON.stringify(variables),...(needsWebTokens&&auth?{fb_dtsg:auth,jazoest:'2'+[...auth].reduce((n,c)=>n+c.charCodeAt(0),0),__user:this.userId}:{}),...(needsWebTokens&&lsd?{lsd}:{})},ttl});
    let result=await send();
    if(!mutation&&result.errors?.length&&(!result.data||Object.values(result.data).every(v=>v==null))){await new Promise(resolve=>setTimeout(resolve,200));result=await send();}
    if(result.errors?.length && (!result.data || Object.values(result.data).every(v=>v==null)))throw new InstagramError('Instagram changed this query or needs a fresh sign-in.',502,'ENDPOINT_CHANGED');
    return result.data || {};
  }
  async request(path, { method = 'GET', form, ttl = 30_000 } = {}) {
    if (!this.cookies) throw new InstagramError('Connect your Instagram session in Settings.',401,'NOT_CONNECTED');
    if (Date.now() < this.blockedUntil) throw new InstagramError('Instagram asked us to slow down. Try again in a minute.',429,'RATE_LIMITED');
    const key = method+path+JSON.stringify(form); const cached = this.cache.get(key);
    if (cached?.expires > Date.now()) return cached.data;
    if (this.pending.has(key)) return this.pending.get(key);
    const generation = this.generation;
    const task = (async()=>{
      const response = await this.fetcher('https://www.instagram.com'+(path.startsWith('/')?path:'/api/v1/'+path), { method, headers: { Cookie:this.cookies, 'X-CSRFToken':this.csrf,...(this.webTokens?.LSD?{'X-FB-LSD':this.webTokens.LSD}:{}), 'X-IG-App-ID':'936619743392459', 'X-IG-WWW-Claim':'0', Origin:'https://www.instagram.com',  Referer:'https://www.instagram.com/',  ...(form ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) }, body: form ? new URLSearchParams(form).toString() : undefined, redirect:'manual', signal:AbortSignal.timeout(15_000) });
      if (generation !== this.generation) throw new InstagramError('Session changed. Please reload.',401,'NOT_CONNECTED');
      if (response.status === 429) { this.blockedUntil = Date.now()+60_000; throw new InstagramError('Instagram asked us to slow down. Try again in a minute.',429,'RATE_LIMITED'); }
      let data; const text=await response.text(); try { data=JSON.parse(text.replace(/^for\s*\(;;\);/,'')); } catch {}
      if ([301,302,303,307,308,401].includes(response.status)||data?.message==='login_required'||(!data&&/accounts\/login|login_form/.test(text))) throw new InstagramError('Your Instagram session expired. Use Settings → Log in on this phone.',401,'LOGIN_REQUIRED');
      if(data?.challenge||data?.checkpoint_url||data?.message==='challenge_required')throw new InstagramError('Instagram needs an account verification. Open Instagram to approve it, then log in again on this phone.',401,'LOGIN_REQUIRED');
      if(response.status===403)throw new InstagramError('Instagram rejected this action. Your session may still be valid; try again shortly.',403,'ACTION_REJECTED');
      if(!response.ok)throw new InstagramError(`Instagram returned ${response.status}. This action may be temporarily unavailable.`,502,'ENDPOINT_CHANGED');
      if(!data)throw new InstagramError('Instagram returned an unexpected response. Try again shortly.',502,'UPSTREAM');
      if(data.error)throw new InstagramError('Instagram did not accept this request. Try again shortly.',403,'ACTION_REJECTED');
      if(data.status==='fail')throw new InstagramError(data.spam?'Instagram temporarily restricted this action. Try again later.':'Instagram did not accept this action. Try again shortly.',403,'ACTION_REJECTED');
      if(ttl>0&&!data.errors?.length)this.cache.set(key,{data,expires:Date.now()+ttl}); if (this.cache.size>80) this.cache.delete(this.cache.keys().next().value); return data;
    })().finally(()=>this.pending.delete(key));
    this.pending.set(key,task); return task;
  }
}
