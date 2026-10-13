import {build} from 'esbuild';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,extname,relative} from 'node:path';
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
const origin=process.env.SITE_ORIGIN||'https://vave-log.pixer.chatgpt.site';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.png':'image/png'};
const assets={};
function walk(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())walk(p);else assets['/'+relative('dist/web',p)]={body:readFileSync(p).toString('base64'),type:mime[extname(p)]||'application/octet-stream'}}}
walk('dist/web');
await build({entryPoints:['src/server/worker.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,conditions:['workerd','browser'],plugins:[{name:'vave-assets',setup(b){b.onResolve({filter:/^virtual:vave-assets$/},()=>({path:'assets',namespace:'vave'}));b.onLoad({filter:/.*/,namespace:'vave'},()=>({contents:`export const siteOrigin=${JSON.stringify(origin)};export const assets=${JSON.stringify(assets)};`,loader:'js'}))}}]});
mkdirSync('dist/.openai',{recursive:true});writeFileSync('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Worker built with ${Object.keys(assets).length} local assets; no external asset requests.`);
