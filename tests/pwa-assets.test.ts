import {afterEach, describe, expect, it} from 'vitest';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';

const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));
function build(){const dir=mkdtempSync(join(tmpdir(),'vave-pwa-'));dirs.push(dir);cpSync('public',dir,{recursive:true});execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);return dir;}
describe('PWA distribution',()=>{
 it('ships installable, correctly sized PNGs including opaque maskable and Apple icons',()=>{
  const dir=build(),manifest=JSON.parse(readFileSync(join(dir,'manifest.webmanifest'),'utf8'));
  expect(manifest).toMatchObject({id:'/',start_url:'/',scope:'/',display:'standalone',name:'VAVE.LOG'});
  for(const [file,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]] as const){
   const png=readFileSync(join(dir,'icons',file));expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);
   const chunks:Buffer[]=[];for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));offset+=12+length;}
   const raw=inflateSync(Buffer.concat(chunks));expect(raw.length).toBe(size*(1+size*4));
   if(file.includes('maskable')||file.includes('apple'))for(let row=0;row<size;row++)for(let col=0;col<size;col++)expect(raw[row*(1+size*4)+1+col*4+3]).toBe(255);
  }
  expect(manifest.icons.map((icon:{src:string})=>icon.src)).toEqual(['/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png']);
 });
 it('versions offline assets by content so updates never reuse stale offline copy',()=>{
  const dir=build(),first=readFileSync(join(dir,'sw.js'),'utf8');expect(first).not.toContain('__VAVE_OFFLINE_VERSION__');
  writeFileSync(join(dir,'offline.css'),readFileSync(join(dir,'offline.css'),'utf8')+'\n/* changed */');
  execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);expect(readFileSync(join(dir,'sw.js'),'utf8')).not.toBe(first);
 });
 it('detects application-only releases as worker updates and stays reproducible',()=>{
  const dir=build(),first=readFileSync(join(dir,'sw.js'),'utf8');
  writeFileSync(join(dir,'index.html'),'<html>A new application build</html>');
  execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);const next=readFileSync(join(dir,'sw.js'),'utf8');expect(next).not.toBe(first);
  execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);expect(readFileSync(join(dir,'sw.js'),'utf8')).toBe(next);
 });
 it('preloads the workspace chunk, its stylesheet and the Latin font and lists the needed build files for the worker (idempotent, base-path aware)',()=>{
  const dir=build();mkdirSync(join(dir,'assets'));
  for(const name of ['index-abc.js','rolldown-runtime-r.js','workspace-def.js','workspace-ghi.css','index-jkl.css','finance-mno.js','help-pqr.js','lottie_light-stu.js','readex-pro-latin-wght-normal-vwx.woff2','readex-pro-arabic-wght-normal-yz1.woff2','readex-pro-vietnamese-wght-normal-234.woff2'])writeFileSync(join(dir,'assets',name),name);
  writeFileSync(join(dir,'index.html'),'<!doctype html><html><head><title>x</title><script type="module" crossorigin src="/vave.log/assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="/vave.log/assets/index-jkl.css"></head><body></body></html>');
  execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);
  const html=readFileSync(join(dir,'index.html'),'utf8');
  expect(html).toContain('<link rel="modulepreload" crossorigin href="/vave.log/assets/workspace-def.js" data-vave-preload>');
  expect(html).toContain('<link rel="preload" as="style" crossorigin href="/vave.log/assets/workspace-ghi.css" data-vave-preload>');
  expect(html).toContain('<link rel="preload" as="font" type="font/woff2" crossorigin href="/vave.log/assets/readex-pro-latin-wght-normal-vwx.woff2" data-vave-preload>');
  expect(html.match(/data-vave-preload/g)).toHaveLength(3);
  const sw=readFileSync(join(dir,'sw.js'),'utf8');
  expect(sw).not.toContain('__VAVE_ASSETS__');
  expect(sw).toContain(JSON.stringify(['/vave.log/assets/finance-mno.js','/vave.log/assets/help-pqr.js','/vave.log/assets/index-abc.js','/vave.log/assets/index-jkl.css','/vave.log/assets/readex-pro-latin-wght-normal-vwx.woff2','/vave.log/assets/rolldown-runtime-r.js','/vave.log/assets/workspace-def.js','/vave.log/assets/workspace-ghi.css']));
  execFileSync(process.execPath,['scripts/build-pwa.mjs',dir]);
  expect(readFileSync(join(dir,'index.html'),'utf8')).toBe(html);expect(readFileSync(join(dir,'sw.js'),'utf8')).toBe(sw);
 });
 it('loads the manifest with private-host credentials and exposes Apple installation metadata',()=>{
  const html=readFileSync('index.html','utf8');expect(html).toMatch(/rel="manifest"[^>]+crossorigin="use-credentials"/);expect(html).toContain('apple-touch-icon');expect(html).toContain('viewport-fit=cover');
 });
});
