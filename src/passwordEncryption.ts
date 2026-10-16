// Instagram's web envelope: AES-256-GCM, timestamp AAD, sealed-box AES key.
export async function encryptInstagramPassword(password:string,config:{keyId:number;publicKey:string;version:number;tag?:string},timestamp=Math.floor(Date.now()/1000).toString()){
 if(!/^[a-f0-9]{64}$/i.test(config.publicKey)||config.keyId<0||config.keyId>255)throw new Error('Instagram returned an invalid encryption key.');
 const {default:sodium}=await import('libsodium-wrappers');await sodium.ready;
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const raw=new Uint8Array(await crypto.subtle.exportKey('raw',key));const publicKey=Uint8Array.from(config.publicKey.match(/../g)!,byte=>parseInt(byte,16));
 const sealed=sodium.crypto_box_seal(raw,publicKey);raw.fill(0);const bytes=new TextEncoder().encode(password);let encrypted:ArrayBuffer;try{encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(12),additionalData:new TextEncoder().encode(timestamp),tagLength:128},key,bytes);}finally{bytes.fill(0);}
 const cipher=new Uint8Array(encrypted);const result=new Uint8Array(4+sealed.length+cipher.length);result[0]=1;result[1]=config.keyId;new DataView(result.buffer).setUint16(2,sealed.length,true);result.set(sealed,4);result.set(cipher.slice(-16),4+sealed.length);result.set(cipher.slice(0,-16),4+sealed.length+16);
 return `${config.tag||'#PWD_INSTAGRAM_BROWSER'}:${config.version}:${timestamp}:${btoa(String.fromCharCode(...result))}`;
}
