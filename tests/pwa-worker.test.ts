import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
const origin='https://log.example.test';
function harness(precache:string[]=[]){
 const listeners:Record<string,(e:any)=>void>={};const stores=new Map<string,Map<string,Response>>();
 const fetch=vi.fn(async(input:Request|string)=>{const url=typeof input==='string'?input:input.url;const path=new URL(url,origin).pathname;return new Response('public '+path,{headers:{'content-type':path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'image/svg+xml'}});});
 const caches={open:async(name:string)=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name)!;return {put:async(key:Request|string,r:Response)=>store.set(typeof key==='string'?new URL(key,origin).href:key.url,r.clone()),match:async(key:Request|string)=>store.get(typeof key==='string'?new URL(key,origin).href:key.url)?.clone()};},keys:async()=>[...stores.keys()],delete:async(name:string)=>stores.delete(name)};
 const self={location:new URL(origin+'/sw.js'),addEventListener:(type:string,fn:(e:any)=>void)=>listeners[type]=fn,clients:{claim:vi.fn(async()=>{})},skipWaiting:vi.fn(async()=>{})};
 runInNewContext(readFileSync('public/sw.js','utf8').replace('[/*__VAVE_ASSETS__*/]',JSON.stringify(precache)),{self,caches,fetch,URL,Request,Response,Promise});
 async function event(name:string,values:Record<string,unknown>={}){let pending:Promise<unknown>|undefined;listeners[name]({...values,waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;}
 async function request(path:string,opts:Record<string,unknown>={}){let response:Promise<Response>|undefined;listeners.fetch({request:{url:new URL(path,origin).href,method:'GET',mode:'navigate',destination:'document',headers:new Headers(),...opts},respondWith:(p:Promise<Response>)=>{response=p;}});return response?await response:undefined;}
 return {stores,fetch,self,event,request};
}
describe('PWA cache boundary',()=>{
 it('installs only the public offline assets and waits for explicit update activation',async()=>{const h=harness();await h.event('install');const urls=[...h.stores.values()].flatMap(s=>[...s.keys()]);expect(urls.map(u=>new URL(u).pathname).sort()).toEqual(['/offline.css','/offline.html','/offline.js']);expect(h.self.skipWaiting).not.toHaveBeenCalled();});
 it.each(['redirect','html-script','failure'])('rejects unsafe install response: %s',async(kind)=>{const h=harness();h.fetch.mockImplementation(async()=>{const r=new Response('login',{status:kind==='failure'?403:200,headers:{'content-type':'text/html'}});if(kind==='redirect')Object.defineProperty(r,'redirected',{value:true});return r;});await expect(h.event('install')).rejects.toThrow();});
 it('returns fresh navigation without storing its contents; offline gets only the fallback',async()=>{const h=harness();await h.event('install');h.fetch.mockResolvedValue(new Response('private dashboard'));expect(await (await h.request('/'))?.text()).toBe('private dashboard');expect([...h.stores.values()].some(s=>s.has(origin+'/'))).toBe(false);h.fetch.mockRejectedValue(Error('offline'));const r=await h.request('/');expect(await r?.text()).toContain('public /offline.html');});
 it('does not turn reachable server errors into successful offline pages',async()=>{const h=harness();await h.event('install');h.fetch.mockResolvedValue(new Response('forbidden',{status:403}));expect((await h.request('/'))?.status).toBe(403);});
 it.each(['/api/config','/api/mcp','/api/anything','/.well-known/oauth-protected-resource','/healthz','/oauth/consent?authorization_id=x','/?code=secret','/?reset=1','/?access_token=secret','/?token_hash=secret','https://test.supabase.co/rest/v1/projects','/export.csv'])('does not intercept sensitive/non-app navigation %s',async(path)=>{const h=harness();expect(await h.request(path)).toBeUndefined();expect(h.fetch).not.toHaveBeenCalled();});
 it('does not intercept writes, bearer requests or ordinary API fetches',async()=>{const h=harness();expect(await h.request('/',{method:'POST'})).toBeUndefined();expect(await h.request('/',{headers:new Headers({authorization:'Bearer token'})})).toBeUndefined();expect(await h.request('/',{mode:'cors',destination:''})).toBeUndefined();});
 it('cleans only older app-owned caches and claims clients',async()=>{const h=harness();await h.event('install');h.stores.set('vave-log-offline-obsolete',new Map());h.stores.set('other-app',new Map());await h.event('activate');expect(h.stores.has('vave-log-offline-obsolete')).toBe(false);expect(h.stores.has('other-app')).toBe(true);expect(h.self.clients.claim).toHaveBeenCalledOnce();});
 it('accepts update messages only from same-origin clients',async()=>{const h=harness();await h.event('message',{data:{type:'VAVE_ACTIVATE_UPDATE'},source:{url:'https://evil.test/'}});expect(h.self.skipWaiting).not.toHaveBeenCalled();await h.event('message',{data:{type:'VAVE_ACTIVATE_UPDATE'},source:{url:origin+'/'}});expect(h.self.skipWaiting).toHaveBeenCalledOnce();});
 it('precaches listed build files best-effort and serves /assets/ cache-first, storing only static same-origin responses',async()=>{
  const h=harness(['/assets/index-abc.js','/assets/workspace-def.css','/assets/missing-ghi.js']);
  h.fetch.mockImplementation(async(input:Request|string)=>{const path=new URL(typeof input==='string'?input:input.url,origin).pathname;if(path.includes('missing'))throw Error('not deployed');return new Response('public '+path,{headers:{'content-type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript'}});});
  await h.event('install');
  const urls=()=>[...h.stores.values()].flatMap(s=>[...s.keys()]).map(u=>new URL(u).pathname).sort();
  expect(urls()).toEqual(['/assets/index-abc.js','/assets/workspace-def.css','/offline.css','/offline.html','/offline.js']);
  // Cache-first: a precached file is answered without any fetch.
  h.fetch.mockClear();
  expect(await (await h.request('/assets/index-abc.js',{mode:'no-cors',destination:'script'}))?.text()).toBe('public /assets/index-abc.js');
  expect(h.fetch).not.toHaveBeenCalled();
  // A lazy chunk not in the list is fetched once and then served from the cache.
  h.fetch.mockResolvedValueOnce(new Response('chunk',{headers:{'content-type':'text/javascript'}}));
  expect(await (await h.request('/assets/finance-xyz.js',{mode:'cors',destination:'script'}))?.text()).toBe('chunk');
  expect(await (await h.request('/assets/finance-xyz.js',{mode:'cors',destination:'script'}))?.text()).toBe('chunk');
  expect(h.fetch).toHaveBeenCalledOnce();
  // A login page or error answering an asset URL is passed through but never stored.
  h.fetch.mockResolvedValueOnce(new Response('<html>login</html>',{headers:{'content-type':'text/html'}}));
  expect(await (await h.request('/assets/other-123.js',{mode:'cors',destination:'script'}))?.text()).toBe('<html>login</html>');
  h.fetch.mockResolvedValueOnce(new Response('denied',{status:403,headers:{'content-type':'text/javascript'}}));
  expect((await h.request('/assets/other-456.js',{mode:'cors',destination:'script'}))?.status).toBe(403);
  expect(urls()).toEqual(['/assets/finance-xyz.js','/assets/index-abc.js','/assets/workspace-def.css','/offline.css','/offline.html','/offline.js']);
  // Only build files: an export or image under another path keeps the old rules.
  expect(await h.request('/assets/report.csv',{mode:'cors',destination:''})).toBeUndefined();
  expect(await h.request('/icons/icon-192.png',{mode:'no-cors',destination:'image'})).toBeUndefined();
 });
 it('returns a useful unavailable response if the offline cache was evicted',async()=>{const h=harness();h.fetch.mockRejectedValue(Error('offline'));expect((await h.request('/'))?.status).toBe(503);});
});
