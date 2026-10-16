import app from './app.mjs';
import express from 'express';
import { fileURLToPath } from 'node:url';
const port=Number(process.env.PORT || 4310);const host=process.env.HOST || '127.0.0.1';
if(process.env.NODE_ENV==='production'){app.use(express.static(fileURLToPath(new URL('../dist',import.meta.url))));app.get('/{*path}',(req,res)=>res.sendFile(fileURLToPath(new URL('../dist/index.html',import.meta.url))));}
else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(port,host,()=>console.log(`Instagram PWA is running at http://localhost:${port}.`));
