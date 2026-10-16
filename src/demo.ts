import type { User, Media, Tray, Comment, Page } from './types';
const person = (id:string,username:string,name:string,avatar:string):User=>({id,username,name,avatar:'/media/avatar-'+avatar+'.jpg'});
export const users = [person('101','maya.onfilm','Maya Chen','maya'),person('102','noah.outside','Noah Williams','noah'),person('103','olivia.studio','Olivia James','olivia'),person('104','zara.explores','Zara Ali','zara')];
export const me:User = {...users[3],bio:'Collecting places, little moments, and good light. 🌿',followers:1248,following:386,posts:24};
const media = (id:string, user:User, image:string, caption:string, location:string,likes:number):Media=>({id,code:'',user,image:'/media/'+image+'.jpg',video:'',kind:'image',caption,location,likes,commentCount:12,timestamp:Math.floor(Date.now()/1000)-3600,children:[]});
export const posts:Media[] = [
 media('1',users[0],'coast','Somewhere between the sea and the sky. Taking the long way home. 🌊','Amalfi Coast, Italy',1248),
 media('2',users[1],'mountain','A little less screen time. A little more of this.','Dolomites, Italy',892),
 media('3',users[2],'cafe','Slow mornings, good coffee, and absolutely no plans.','Copenhagen, Denmark',624),
 media('4',users[3],'architecture','Looking up is always worth it.','Lisbon, Portugal',438),
 media('5',users[0],'forest','The quiet kind of beautiful.','Black Forest, Germany',1086),
 media('6',users[2],'flowers','A small reminder to stop and notice.','Sunday at home',367),
];
posts[0]={...posts[0],kind:'carousel',children:[{...posts[0]},media('1-2',users[0],'sea','', '',0),media('1-3',users[0],'portrait','', '',0)]};
export const reels = ['coast','forest','city'].map((name,i):Media=>({...posts[i],id:'reel'+i,kind:'video',video:'/media/reel-'+name+'.mp4',image:'/media/'+(name==='city'?'architecture':name)+'.jpg',caption:['A few seconds of somewhere you’d rather be. 🌊','Your daily dose of green. A quiet walk through the forest, with sunlight through the leaves and nothing on the agenda except seeing where the trail goes. Save this little escape for a moment when you need to slow down. 🌿 #forest #nature #walking #weekend #quietmoments','A city that never stops surprising.'][i],children:[]}));
export const trays:Tray[] = [...users,...users.map((u,i)=>({...u,id:String(105+i),username:['luca.travels','the.daily.frame','sunday.people','wildandquiet'][i]}))].map(u=>({id:u.id,user:u,seen:0}));
export const storyItems = (id:string)=>{const u=trays.find(t=>t.id===id)?.user ?? users[0];return [{...posts[0],id:'story'+id,user:u,kind:'image' as const,children:[]},{...posts[1],id:'story'+id+'b',user:u}];};
export const demoComments:Comment[] = [{id:'c1',user:users[1],text:'This is the kind of day I need. Beautiful light!',likes:24,replies:1},{id:'c2',user:users[2],text:'Saved for the next little escape 🌿',likes:8,replies:0},{id:'c3',user:users[3],text:'The colors are unreal.',likes:3,replies:0}];
export function demoPage<T>(items:T[]):Page<T>{return {items,cursor:null,more:false};}
