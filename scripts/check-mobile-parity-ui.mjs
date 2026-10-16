import {chromium,webkit} from '@playwright/test';
import ts from 'typescript';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const demo=ts.transpileModule(await readFile('src/demo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {posts,reels,me,users,trays,storyItems,demoPage,demoComments}=await import('data:text/javascript;base64,'+Buffer.from(demo).toString('base64'));
await mkdir('proof',{recursive:true});
const engine=process.env.UI_ENGINE==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true});
try{for(const viewport of [{width:390,height:844},{width:430,height:932}]){
const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce',recordVideo:{dir:'proof',size:viewport}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('Blocked aria-hidden'))errors.push(m.text());});let feedCalls=0;
await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname.slice(5);let d;
if(p==='status')d={connected:true,local:false};else if(p==='me')d={user:me};
else if(p==='feed'){const batch=feedCalls++;d={items:posts.map((m,i)=>({...m,id:`feed-${batch}-${i}`,caption:('Long caption with enough text to wrap into many lines. ').repeat(15)})),cursor:String(batch+1),more:batch<3};}
else if(p==='stories')d={items:trays};else if(p.startsWith('stories/'))d={items:[{...reels[0],id:'story-video'},storyItems(p.slice(8))[1]]};
else if(p==='reels'||p==='explore')d=demoPage(reels);
else if(p==='profile/me')d={user:me,...demoPage(posts)};else if(p.startsWith('profile/'))d={user:users[0],...demoPage(posts)};
else if(p.startsWith('comments/'))d=demoPage(demoComments);else d={items:[]};await route.fulfill({json:d});});
await page.goto('http://localhost:4310/');await page.locator('.post').first().waitFor();
assert.deepEqual(await page.locator('.bottom-nav button').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label'))),['Home','Reels','Messages','Search','Profile']);
assert.equal(await page.getByRole('button',{name:'Load more posts',exact:true}).count(),0);
await page.locator('.post-caption-more').first().click();assert.equal(await page.locator('.post-caption').first().evaluate(el=>el.classList.contains('expanded')),true);
await page.locator('.content').evaluate(el=>el.scrollTop=600);await page.waitForTimeout(100);
await page.locator('.bottom-nav button').nth(3).click();await page.getByRole('textbox',{name:'Search people'}).waitFor();await page.locator('.bottom-nav button').first().click();assert.ok(await page.locator('.content').evaluate(el=>el.scrollTop)>=590,'home scroll position survives tab switch');
await page.locator('.content').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForFunction(n=>document.querySelectorAll('.post').length>n,posts.length);assert.ok(feedCalls>1,'feed pages automatically');
await page.locator('.bottom-nav button').nth(4).click();await page.locator('.profile-page').waitFor();assert.equal(await page.getByRole('tab',{name:'Posts',exact:true}).getAttribute('aria-selected'),'true');
await page.locator('.photo-grid button').first().click();await page.getByRole('dialog',{name:'Post',exact:true}).waitFor();assert.equal(await page.locator('.detail-screen').evaluate(el=>el.getBoundingClientRect().top),0,'posts fill the screen');
await page.getByRole('button',{name:/View comments on/}).first().click();await page.getByRole('dialog',{name:'Comments',exact:true}).waitFor();
assert.equal(await page.locator('.comment-original').count(),0,'comments do not repeat the whole caption');await page.getByRole('button',{name:'Add 🔥',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Add a comment'}).inputValue(),'🔥');
await page.goBack();await page.getByRole('dialog',{name:'Comments',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog',{name:'Post',exact:true}).count(),1,'back closes comments and retains post');
await page.getByRole('button',{name:'Close post',exact:true}).click();await page.getByRole('dialog',{name:'Post',exact:true}).waitFor({state:'hidden'});assert.equal(await page.locator('#root').evaluate(el=>el.inert),false,'background regains interaction');await page.locator('.photo-grid button').first().click();await page.getByRole('dialog',{name:'Post',exact:true}).waitFor();await page.mouse.move(10,300);await page.mouse.down();await page.mouse.move(150,300,{steps:5});await page.mouse.up();await page.getByRole('dialog',{name:'Post',exact:true}).waitFor({state:'hidden'});
await page.locator('.bottom-nav button').first().click();await page.locator('.content').evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:"View maya.onfilm's story",exact:true}).click();await page.getByRole('dialog',{name:"maya.onfilm's stories",exact:true}).waitFor();await page.getByRole('button',{name:'Resume stories',exact:true}).click();await page.waitForFunction(()=>{const v=document.querySelector('.story-card video');return v&&!v.paused&&v.currentTime>.2;});const bounds=await page.locator('.story-tap-zones').boundingBox();await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.3);await page.mouse.down();await page.waitForTimeout(300);const heldTime=await page.locator('.story-card video').evaluate(v=>{if(!v.paused)throw new Error('Hold did not pause story');return v.currentTime;});await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.story-card video').paused);assert.ok(await page.locator('.story-card video').evaluate(v=>v.currentTime)>=heldTime,'hold resumes the same story position');await page.getByRole('button',{name:'Next story',exact:true}).click();assert.ok((await page.locator('.story-footer').innerText()).includes('2 / 2'));assert.equal(await page.locator('.story-tap-zones').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');await page.getByRole('button',{name:'Close story',exact:true}).click();
await page.locator('.bottom-nav button').nth(1).click();await page.locator('.reel').first().waitFor();assert.equal(await page.locator('.reel-actions .save-action').count(),0);assert.equal(await page.getByRole('button',{name:'Next reel',exact:true}).count(),0);const pager=page.getByRole('region',{name:'Reels',exact:true});await page.locator('[data-pwacn-page="0"] .reel-touch-surface').focus();await pager.evaluate(el=>el.scrollTop=el.clientHeight);await page.waitForFunction(()=>document.querySelector('[data-pwacn-page="1"]').getAttribute('aria-hidden')==='false');await page.locator('.bottom-nav button').nth(3).click();await page.locator('.bottom-nav button').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-pwacn-page="1"]').getAttribute('aria-hidden')==='false');assert.equal(await page.locator('.reel-pager').evaluate(el=>Math.round(el.scrollTop/el.clientHeight)),1,'reel position survives switching tabs');await page.screenshot({path:`proof/parity-${process.env.UI_ENGINE||'chromium'}-${viewport.width}.png`});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
await context.close();}
console.log(`${process.env.UI_ENGINE||'chromium'} mobile parity passed: nav order, captions, feed paging, retained scroll, full-screen posts, browser back, reaction composer, stories, bounded reels and no horizontal overflow.`);
}finally{await browser.close();}
