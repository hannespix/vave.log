/** Shared by the Node host and bundled Site worker. */
export function staticAssetHeaders(pathname:string,contentType?:string):Record<string,string>{
 return {
  ...(contentType?{'content-type':contentType}:{}),
  'cache-control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store',
  ...(pathname==='/manifest.webmanifest'?{'content-type':'application/manifest+json; charset=utf-8'}:{}),
  ...(pathname==='/sw.js'?{'service-worker-allowed':'/'}:{}),
 };
}
