// Reproducible app icons from the existing VAVE vector mark; no native tools required.
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
const out=process.argv[2]||'dist/web';
const svg=readFileSync('public/favicon.svg','utf8');
if(!svg.includes('m15 18 17 30 17-30H38l-6 12-6-12Z'))throw Error('Update the PWA rasterizer when changing the vector mark.');
const colors=[...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map(match=>match[1].slice(1).match(/../g).map(v=>parseInt(v,16)));
const polygon=[[15,18],[32,48],[49,18],[38,18],[32,30],[26,18]];
function inside(x,y){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[a,b]=polygon[i],[c,d]=polygon[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;}
function crc32(buf){let crc=0xffffffff;for(const byte of buf){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,body){const tag=Buffer.from(type),data=Buffer.concat([tag,body]),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(data));return Buffer.concat([length,data,crc]);}
function icon(size,rounded){
 const pixels=Buffer.alloc(size*(1+size*4)),samples=4;
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  const sum=[0,0,0,0];
  for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
   const x=(col+(sx+.5)/samples)*64/size,y=(row+(sy+.5)/samples)*64/size;
   const dx=Math.max(16-x,0,x-48),dy=Math.max(16-y,0,y-48);
   if(rounded&&dx*dx+dy*dy>256)continue;
   const color=colors[inside(x,y)?1:0];for(let k=0;k<3;k++)sum[k]+=color[k];sum[3]++;
  }
  const offset=row*(1+size*4)+1+col*4;
  for(let k=0;k<3;k++)pixels[offset+k]=sum[3]?Math.round(sum[k]/sum[3]):0;
  pixels[offset+3]=Math.round(255*sum[3]/(samples*samples));
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
mkdirSync(join(out,'icons'),{recursive:true});
for(const[name,size,rounded]of[['icon-192.png',192,true],['icon-512.png',512,true],['icon-maskable-512.png',512,false],['apple-touch-icon.png',180,false]])writeFileSync(join(out,'icons',name),icon(size,rounded));
const hash=createHash('sha256');
// Application-only releases must also offer an update; the runtime cache still
// contains only the four public offline assets, never these application files.
function versionTree(dir,prefix=''){
 for(const file of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const name=prefix+file.name;if(name==='sw.js')continue;
  if(file.isDirectory())versionTree(join(dir,file.name),name+'/');
  else hash.update(name).update(readFileSync(join(dir,file.name)));
 }
}
// Faster start: the workspace chunk, its stylesheet and the Latin font are
// fetched together with the entry bundle instead of one round-trip later, and
// the service worker precaches the build files that every session needs
// (lazy extras like the logo animation and non-Latin fonts stay on demand).
// The base path is read from the entry script Vite wrote, so the same step
// serves the root deployment and a Pages project site. Idempotent: a second
// run leaves the document unchanged.
const indexPath=join(out,'index.html');
const assetsDir=join(out,'assets');
let precache=[];
if(existsSync(indexPath)&&existsSync(assetsDir)){
 let html=readFileSync(indexPath,'utf8');
 const entry=html.match(/<script type="module" crossorigin src="([^"]*\/assets\/)index-[^"]+\.js"><\/script>/);
 const assets=readdirSync(assetsDir).sort();
 if(entry&&!html.includes('data-vave-preload')){
  const prefix=entry[1];
  const links=[];
  const find=(pattern)=>assets.find(name=>pattern.test(name));
  const chunk=find(/^workspace-.*\.js$/),style=find(/^workspace-.*\.css$/),font=find(/^readex-pro-latin-wght-normal-.*\.woff2$/);
  if(chunk)links.push(`<link rel="modulepreload" crossorigin href="${prefix}${chunk}" data-vave-preload>`);
  if(style)links.push(`<link rel="preload" as="style" crossorigin href="${prefix}${style}" data-vave-preload>`);
  if(font)links.push(`<link rel="preload" as="font" type="font/woff2" crossorigin href="${prefix}${font}" data-vave-preload>`);
  if(links.length){html=html.replace('</head>',links.join('')+'</head>');writeFileSync(indexPath,html);}
 }
 if(entry)precache=assets.filter(name=>/\.(?:js|css|woff2)$/.test(name)&&!/^lottie|arabic|vietnamese/.test(name)).map(name=>entry[1]+name);
}
versionTree(out);
writeFileSync(join(out,'sw.js'),readFileSync('public/sw.js','utf8').replace('__VAVE_OFFLINE_VERSION__',hash.digest('hex').slice(0,16)).replace('[/*__VAVE_ASSETS__*/]',JSON.stringify(precache)));
