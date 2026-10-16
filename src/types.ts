export type User = {id:string;username:string;name:string;avatar:string;verified?:boolean;bio?:string;followers?:number;following?:number;posts?:number};
export type Media = {id:string;code:string;user:User;image:string;video:string;kind:'image'|'video'|'carousel';caption:string;likes:number;liked?:boolean;commentCount:number;timestamp:number;location:string;children:Media[]};
export type Tray = {id:string;user:User;seen:number};
export type Comment = {id:string;user:User;text:string;likes:number;liked?:boolean;replies:number};
export type Page<T> = {items:T[];cursor:string|null;more:boolean};
