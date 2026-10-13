import express from 'express';
import rateLimit from 'express-rate-limit';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readConfig,createHttpHandler,securityHeaders} from './http.js';
const config=readConfig(process.env);const handle=createHttpHandler(config);const app=express();
app.disable('x-powered-by');
const proxyHops=Number(process.env.TRUST_PROXY_HOPS||0);if(!Number.isInteger(proxyHops)||proxyHops<0||proxyHops>3)throw Error('Invalid TRUST_PROXY_HOPS');app.set('trust proxy',proxyHops);
app.use((_req,res,next)=>{for(const[k,v]of Object.entries(securityHeaders(config)))res.setHeader(k,v);next()});
app.use('/mcp',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));
app.use(async(req,res,next)=>{
 if(!['/mcp','/healthz','/api/config'].includes(req.path)&&!req.path.startsWith('/.well-known/'))return next();
 try{
  const headers=new Headers();for(const[k,v]of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(', '):v)}
  const init:RequestInit&{duplex?:'half'}={method:req.method,headers};
  if(!['GET','HEAD'].includes(req.method)){init.body=Readable.toWeb(req) as ReadableStream<Uint8Array>;init.duplex='half'}
  const result=await handle(new Request(config.appUrl+req.originalUrl,init),req.ip||'shared');res.status(result.status);result.headers.forEach((v,k)=>res.setHeader(k,v));res.send(Buffer.from(await result.arrayBuffer()));
 }catch{res.status(500).json({error:'Anfrage fehlgeschlagen.'})}
});
const webDir=fileURLToPath(new URL('../../web/',import.meta.url));
app.use(express.static(webDir,{dotfiles:'deny',index:false,etag:true,maxAge:0,setHeaders(res,file){if(file.includes(path.sep+'assets'+path.sep))res.setHeader('Cache-Control','public, max-age=31536000, immutable')}}));
app.get('/{*path}',(_req,res)=>res.sendFile(path.join(webDir,'index.html')));
const port=Number(process.env.PORT||3000);const server=app.listen(port,'0.0.0.0',()=>console.log(`VAVE.LOG listening on port ${port} (${config.configured?'configured':'setup required'})`));
function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
