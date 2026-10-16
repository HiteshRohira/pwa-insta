import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export const key = process.env.SESSION_KEY ? createHash('sha256').update(process.env.SESSION_KEY).digest() : randomBytes(32);
export function seal(cookies, purpose='session', now=Date.now()) {
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const payload=JSON.stringify({cookies,purpose,expires:now+(['transfer','login'].includes(purpose)?10*60_000:7*24*3600_000)});const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function unseal(token,purpose='session',now=Date.now()) {
 try {if(typeof token!=='string'||token.length>7000)return null;const data=Buffer.from(token,'base64url');if(data.length<29)return null;const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));const payload=JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString());return payload.purpose===purpose&&payload.expires>now&&Array.isArray(payload.cookies)?payload.cookies:null;} catch{return null;}
}
export function readCookie(header,name){return (header || '').split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1) || '';}
