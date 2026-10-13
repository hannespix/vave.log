import {createHttpHandler,readConfig,securityHeaders,type Config} from './http.js';
import {assets,siteOrigin} from 'virtual:vave-assets';
let active:{key:string;config:Config;handler:ReturnType<typeof createHttpHandler>}|undefined;
export default {
 async fetch(request:Request,env:Record<string,string|undefined>){
  const config=readConfig({NODE_ENV:'production',APP_URL:env.APP_URL||siteOrigin,SUPABASE_URL:env.SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY});
  const key=JSON.stringify(config);if(active?.key!==key)active={key,config,handler:createHttpHandler(config)};
  const url=new URL(request.url);
  // Cloudflare replaces CF-Connecting-IP at ingress; do not use X-Forwarded-For.
  if(['/mcp','/healthz','/api/config'].includes(url.pathname)||url.pathname.startsWith('/.well-known/'))return active!.handler(request,request.headers.get('cf-connecting-ip')||'shared');
  const headers=securityHeaders(config);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  if((request.headers.get('host')||url.host)!==new URL(config.appUrl).host)return new Response('Host not allowed',{status:403,headers});
  let asset=assets[url.pathname];
  if(!asset&&!url.pathname.split('/').pop()?.includes('.'))asset=assets['/index.html'];
  if(!asset)return new Response('Not found',{status:404,headers});
  const data=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:data,{headers:{...headers,'content-type':asset.type,'cache-control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store'}});
 }
};
