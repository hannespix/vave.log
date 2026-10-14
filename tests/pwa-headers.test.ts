import {describe,expect,it} from 'vitest';
import {securityHeaders} from '../src/server/http';
import {staticAssetHeaders} from '../src/server/static-headers';
describe('PWA host response policy',()=>{
 it('allows only same-origin workers and manifests without loosening scripts or connections',()=>{
  const csp=securityHeaders({supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'public',appUrl:'https://log.example.test',configured:true})['content-security-policy'];
  expect(csp).toContain("worker-src 'self'");expect(csp).toContain("manifest-src 'self'");expect(csp).toContain("script-src 'self';");expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
 });
 it('serves manifests with the install MIME type and always revalidates the root worker',()=>{
  expect(staticAssetHeaders('/manifest.webmanifest','application/octet-stream')).toMatchObject({'content-type':'application/manifest+json; charset=utf-8','cache-control':'no-store'});
  expect(staticAssetHeaders('/sw.js','text/javascript')).toMatchObject({'content-type':'text/javascript','cache-control':'no-store','service-worker-allowed':'/'});
  expect(staticAssetHeaders('/offline.html','text/html')['cache-control']).toBe('no-store');
  expect(staticAssetHeaders('/assets/index-abc.js','text/javascript')['cache-control']).toContain('immutable');
 });
});
