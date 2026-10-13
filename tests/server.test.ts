import {describe,it,expect,vi} from 'vitest';
import {createHttpHandler,readConfig} from '../src/server/http.js';
const config={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test',appUrl:'https://log.example.com',configured:true};
describe('HTTP security perimeter',()=>{
 it('does not allow missing config to start a fake backend',async()=>{const h=createHttpHandler(readConfig({}));expect((await h(new Request('http://localhost:3000/healthz'))).status).toBe(503);expect(await (await h(new Request('http://localhost:3000/api/config'))).json()).toMatchObject({configured:false})});
 it('challenges unauthenticated MCP and advertises OAuth',async()=>{const h=createHttpHandler(config);const r=await h(new Request(config.appUrl+'/api/mcp',{method:'POST'}));expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/api/mcp');const m=await h(new Request(config.appUrl+'/.well-known/oauth-protected-resource/api/mcp'));expect(await m.json()).toMatchObject({resource:config.appUrl+'/api/mcp',authorization_servers:['https://test.supabase.co/auth/v1']})});
 it('blocks hostile origins and spoofed hosts before authentication',async()=>{const authenticate=vi.fn();const h=createHttpHandler(config,{authenticate});for(const headers of [{origin:'https://evil.test'},{host:'evil.test'},{origin:'null'}] as Record<string,string>[]){expect((await h(new Request(config.appUrl+'/api/mcp',{method:'POST',headers:headers as Record<string,string>}))).status).toBe(403)}expect(authenticate).not.toHaveBeenCalled()});
 it('rejects expired or invalid bearer token',async()=>{const h=createHttpHandler(config,{authenticate:async()=>{throw Error('secret diagnostic')}});const r=await h(new Request(config.appUrl+'/api/mcp',{method:'POST',headers:{authorization:'Bearer bad'}}));expect(r.status).toBe(401);expect(await r.text()).not.toContain('secret diagnostic')});
 it('bounds failed authentication before making further Auth requests',async()=>{
  const authenticate=vi.fn(async()=>{throw Error('invalid')});const h=createHttpHandler(config,{authenticate});
  const request=()=>new Request(config.appUrl+'/api/mcp',{method:'POST',headers:{authorization:'Bearer bad'}});
  for(let i=0;i<180;i++)expect((await h(request())).status).toBe(401);
  const blocked=await h(request());expect(blocked.status).toBe(429);expect(blocked.headers.get('retry-after')).toBe('60');expect(authenticate).toHaveBeenCalledTimes(180);
  expect((await h(request(),'another-trusted-client')).status).toBe(401);expect(authenticate).toHaveBeenCalledTimes(181);
 });
 it('serves hardening headers and no sensitive config',async()=>{const h=createHttpHandler(config);const r=await h(new Request(config.appUrl+'/api/config'));expect(r.headers.get('x-content-type-options')).toBe('nosniff');expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");expect(r.headers.get('cache-control')).toBe('no-store');expect(Object.keys(await r.json()).sort()).toEqual(['appUrl','configured','supabasePublishableKey','supabaseUrl'])});
 it('validates production URLs and rejects privileged keys',()=>{expect(()=>readConfig({NODE_ENV:'production',APP_URL:'http://evil.test',SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'})).toThrow();expect(()=>readConfig({APP_URL:config.appUrl,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:'sb_secret_do_not_use'})).toThrow()});
});
