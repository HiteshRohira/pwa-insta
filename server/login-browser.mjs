import puppeteer from 'puppeteer-core';
import {randomUUID} from 'node:crypto';
import {InstagramError} from './instagram.mjs';
import {configs,LOGIN_UA} from './login.mjs';
const LOGIN_URL='https://www.instagram.com/accounts/login/';
const NAMES=new Set(['csrftoken','mid','ig_did','sessionid','ds_user_id','rur','datr','dpr','wd','ig_nrcb']);
async function withBrowser(state,callback){
 let browser;let stage='launch';
 try{
  let options;
  if(process.env.VERCEL){const {default:chromium}=await import('@sparticuz/chromium');chromium.setGraphicsMode=false;options={executablePath:await chromium.executablePath(),args:chromium.args.filter(arg=>arg!=='--single-process'),headless:'shell'};}
  else{const {chromium}=await import('@playwright/test');options={executablePath:process.env.PWA_BROWSER_EXECUTABLE||chromium.executablePath(),headless:true};}
  browser=await puppeteer.launch({...options,defaultViewport:{width:390,height:844},protocolTimeout:25000});
  const context=await browser.createBrowserContext();const page=await context.newPage();await page.setUserAgent(LOGIN_UA);
  if(state?.cookies?.length)await context.setCookie(...state.cookies.map(c=>({name:c.name,value:c.value,domain:'.instagram.com',path:'/',secure:true,httpOnly:['sessionid','mid','datr'].includes(c.name)})));
  stage='navigation';const response=await page.goto(LOGIN_URL,{waitUntil:'domcontentloaded',timeout:20000});
  if(response?.status()===429)throw new InstagramError('Instagram asked us to slow down. Try again in a minute.',429,'RATE_LIMITED');
  stage='render';await page.waitForFunction(()=>[...document.querySelectorAll('script[type="application/json"]')].some(s=>s.textContent.includes('caa_login_form_data')),{timeout:15000});
  const config=configs(await page.content());
  stage='exchange';return await callback(page,config,context);
 }catch(error){console.error(JSON.stringify({event:'instagram_login_browser',stage,name:error.name,message:String(error.message).split('\n')[0].replace(/https?:\/\/[^\s)]+/g,'[url]')}));if(error instanceof InstagramError)throw error;throw new InstagramError('Instagram’s login browser could not finish. Try again shortly.',502,'LOGIN_BROWSER');}
 finally{if(browser)await browser.close().catch(()=>{});}
}
export async function prepareBrowserLogin(){return withBrowser(null,async(page,config,browser)=>{const key=config.caa_password_encryption_data?.encryption_data||config.InstagramPasswordEncryption;const ig=config.InstagramPasswordEncryption;const cookies=(await browser.cookies()).filter(c=>NAMES.has(c.name)).map(({name,value})=>({name,value}));if(!key?.public_key||!config.LSD?.token||!cookies.some(c=>c.name==='csrftoken'))throw new InstagramError('Instagram changed its login page. The login adapter needs an update.',502,'LOGIN_CHANGED');return {browser:true,cookies,keyId:Number(key.key_id),publicKey:key.public_key,version:Number(ig?.version||10),tag:'#PWD_BROWSER',deviceId:randomUUID().toUpperCase(),attempts:0};});}
export async function browserLoginRequest(state,path,form){return withBrowser(state,async(page,config,browser)=>{
 const lsd=config.LSD?.token;const extra=config.caa_login_form_data||{};let requestPath='/api/v1/web/accounts/'+path;let body={...form};
 if(path==='login/ajax/'){
  requestPath='/api/graphql';const input={actor_id:'0',client_mutation_id:String(state.attempts+1),access_flow_version:'pre_mt_behavior',account_recovery_entry_point:null,app:'instagram',auth_domain_data_key:null,caa_login_request_extra_info:{ab_test_data:'',shared_prefs_data:'',cuid:extra.idd_user_crypted_uid||'',guid:randomUUID().replaceAll('-','').slice(0,17),jazoest:extra.jazoest?.value||'',lgndim:'',lgnjs:String(Math.floor(Date.now()/1000)),lgnrnd:extra.lgnrnd||'',locale:extra.locale||'',login_source:(extra.login_source||'CAA_LOGIN').toLowerCase(),lsd:extra.lsd?.value||'',next:'',prefill_contact_point:'',prefill_source:'',prefill_type:'',skstamp:'',timezone:''},credential_type:'password',dyi_job_id:'',enc_password:{sensitive_string_value:form.enc_password},event_request_id:randomUUID(),identifier:form.username,ig_web_device_id:state.deviceId,initial_request_id:'1',lids:null,login_source:'LOGIN',next:null,passkey_payload:null,password:{sensitive_string_value:form.enc_password},persistent:true,query_params:'{}',trusted_device_records:'{}',use_uid_to_login:false,waterfall_id:randomUUID()};
  body={av:'0',__d:'www',__user:'0',__a:'1',__comet_req:'7',__crn:'comet.igweb.PolarisCAAIGLoginHomepageRoute',lsd,jazoest:extra.jazoest?.value||'2'+[...lsd].reduce((n,c)=>n+c.charCodeAt(0),0),fb_api_caller_class:'RelayModern',fb_api_req_friendly_name:'useCDSWebLoginMutation',server_timestamps:'true',variables:JSON.stringify({input,scale:1}),doc_id:'28077768681846394'};
 }
 const result=await page.evaluate(async({path,body,lsd})=>{const csrf=document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrftoken='))?.slice(10)||'';const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded','X-FB-LSD':lsd,'X-FB-Friendly-Name':'useCDSWebLoginMutation','X-CSRFToken':csrf,'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams(body).toString()});return {status:response.status,text:await response.text()};},{path:requestPath,body,lsd});
 // Some successful login exchanges finish setting cookies through a same-origin redirect.
 let payload;try{payload=JSON.parse(result.text.replace(/^for\s*\(;;\);/,''))?.data?.caa_login_web;}catch{}
 if(payload?.redirect_uri&&!payload.recaptcha_needed&&!payload.is_ig_login_recaptcha){try{const next=new URL(payload.redirect_uri,LOGIN_URL);if(next.origin==='https://www.instagram.com'&&!next.pathname.startsWith('/challenge/'))await page.goto(next.href,{waitUntil:'domcontentloaded',timeout:15000});}catch{}}
 state.cookies=(await browser.cookies()).filter(c=>NAMES.has(c.name)).map(({name,value})=>({name,value}));
 if(payload&&state.cookies.some(c=>c.name==='sessionid')&&!payload.two_factor_result){payload.ig_authenticated=true;result.text=JSON.stringify({data:{caa_login_web:payload}});}
 return result;
 });}
