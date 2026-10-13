import {createClient} from '@supabase/supabase-js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createService,type Service} from '../shared/service.js';
import {createMcpServer} from './mcp.js';

export interface Config {supabaseUrl:string;supabasePublishableKey:string;appUrl:string;configured:boolean}
export function readConfig(env:Record<string,string|undefined>):Config{
 const appUrl=env.APP_URL||'http://localhost:3000';
 const app=new URL(appUrl);
 const supabaseUrl=env.SUPABASE_URL||'';
 const key=env.SUPABASE_PUBLISHABLE_KEY||'';
 const local=(u:URL)=>u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(app.username||app.password||app.pathname!=='/'||app.search||app.hash||!(app.protocol==='https:'||local(app)))throw Error('APP_URL must be an HTTPS origin (HTTP only on localhost).');
 if(env.NODE_ENV==='production'&&app.protocol!=='https:')throw Error('Production requires HTTPS APP_URL.');
 if(key&&!key.startsWith('sb_publishable_')){
  // Legacy anon keys are supported only after decoding their non-secret role claim.
  try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error()}catch{throw Error('Use a Supabase publishable key or legacy anon key, never a secret/service-role key.')}
 }
 if(supabaseUrl){const u=new URL(supabaseUrl);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||local(u)))throw Error('Invalid SUPABASE_URL.');if(env.NODE_ENV==='production'&&u.protocol!=='https:')throw Error('Production Supabase must use HTTPS.')}
 return {supabaseUrl:supabaseUrl.replace(/\/$/,''),supabasePublishableKey:key,appUrl:app.origin,configured:Boolean(supabaseUrl&&key)};
}
export function securityHeaders(config:Config):Record<string,string>{
 const connect=config.supabaseUrl?` ${new URL(config.supabaseUrl).origin}`:'';
 return {'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()','cache-control':'no-store','content-security-policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'${connect}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,...(config.appUrl.startsWith('https:')?{'strict-transport-security':'max-age=31536000'}:{})};
}
type Principal={userId:string;service:Service};
type Deps={authenticate?:(token:string)=>Promise<Principal>};
export function validateClaims(claims:Record<string,unknown>,config:Config){
 const aud=claims.aud;const audiences=Array.isArray(aud)?aud:[aud];
 if(claims.iss!==config.supabaseUrl+'/auth/v1'||!audiences.includes('authenticated')||claims.role!=='authenticated'||typeof claims.sub!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(claims.sub)||typeof claims.exp!=='number'||claims.exp<=Date.now()/1000||claims.is_anonymous===true)throw Error('Invalid access token');
 return claims.sub;
}
async function limitedBody(request:Request,max=65536){
 const reader=request.body?.getReader();if(!reader)return '';let size=0;const parts:Uint8Array[]=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('too_large')}parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return new TextDecoder().decode(bytes);
}
export function createHttpHandler(config:Config,deps:Deps={}){
 const origin=new URL(config.appUrl);const headers=securityHeaders(config);
 const json=(data:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json; charset=utf-8',...extra}});
 const resource=config.appUrl+'/mcp';const metadata=config.appUrl+'/.well-known/oauth-protected-resource/mcp';
 const challenge=()=>json({error:'Bitte anmelden.'},401,{'www-authenticate':`Bearer resource_metadata="${metadata}"`});
 const authenticate=deps.authenticate??(async(token:string)=>{
  const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data,error}=await client.auth.getClaims(token);if(error||!data)throw Error('Invalid token');
  const userId=validateClaims(data.claims,config);
  const user=await client.auth.getUser(token);if(user.error||user.data.user?.id!==userId||!user.data.user.email_confirmed_at)throw Error('User unavailable');
  return {userId,service:createService(client)};
 });
 const calls=new Map<string,{since:number;count:number}>();
 const attempts=new Map<string,{since:number;count:number}>();
 let totalAttempts={since:Date.now(),count:0};
 const limited=()=>json({error:'Zu viele Anfragen. Bitte kurz warten.'},429,{'retry-after':'60'});
 // The adapter supplies a platform-verified IP. Never trust forwarded headers here.
 // Missing client identity shares one conservative bucket, rather than failing open.
 return async(request:Request,trustedClientKey='shared'):Promise<Response>=>{
  const url=new URL(request.url);const path=url.pathname;
  if((request.headers.get('host')||url.host)!==origin.host)return json({error:'Host nicht erlaubt.'},403);
  const sentOrigin=request.headers.get('origin');if(sentOrigin&&sentOrigin!==origin.origin)return json({error:'Origin nicht erlaubt.'},403);
  if(path==='/api/config'&&request.method==='GET')return json(config);
  if(path==='/healthz'&&request.method==='GET')return json({status:config.configured?'configured':'setup_required',version:'1.0.0'},config.configured?200:503);
  if((path==='/.well-known/oauth-protected-resource/mcp'||path==='/.well-known/oauth-protected-resource')&&request.method==='GET')return config.configured?json({resource,authorization_servers:[config.supabaseUrl+'/auth/v1'],bearer_methods_supported:['header'],resource_name:'VAVE.LOG',resource_documentation:config.appUrl+'/help/mcp'}):json({error:'Backend noch nicht eingerichtet.'},503);
  if(path!=='/mcp')return json({error:'Nicht gefunden.'},404);
  if(!config.configured)return json({error:'Backend noch nicht eingerichtet.'},503);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,Allow:'POST, OPTIONS'}});
  if(request.method!=='POST')return json({error:'Nur POST wird unterstützt. Der MCP-Server arbeitet ohne Sessions.'},405,{Allow:'POST, OPTIONS'});
  const attemptNow=Date.now();
  if(attemptNow-totalAttempts.since>=60000)totalAttempts={since:attemptNow,count:0};
  if(++totalAttempts.count>1000)return limited();
  if(attempts.size>=5000){for(const[k,v]of attempts)if(attemptNow-v.since>=60000)attempts.delete(k);if(attempts.size>=5000)return limited()}
  let attempt=attempts.get(trustedClientKey);if(!attempt||attemptNow-attempt.since>=60000){attempt={since:attemptNow,count:0};attempts.set(trustedClientKey,attempt)}
  if(++attempt.count>180)return limited();
  const match=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{1,8192})$/i);if(!match)return challenge();
  let principal:Principal;try{principal=await authenticate(match[1])}catch{return challenge()}
  const now=Date.now();if(calls.size>5000){for(const[k,v]of calls)if(now-v.since>=60000)calls.delete(k);if(calls.size>5000)return json({error:'Server ausgelastet.'},503)}
  let rate=calls.get(principal.userId);if(!rate||now-rate.since>=60000){rate={since:now,count:0};calls.set(principal.userId,rate)}if(++rate.count>120)return json({error:'Zu viele Anfragen. Bitte kurz warten.'},429,{'retry-after':'60'});
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'JSON erwartet.'},415);
  let body:unknown;try{body=JSON.parse(await limitedBody(request))}catch(error){return json({error:'Ungültiges oder zu großes JSON.'},error instanceof Error&&error.message==='too_large'?413:400)}
  if(Array.isArray(body))return json({error:'Batch-Aufrufe werden nicht unterstützt.'},400);
  const server=createMcpServer(principal.service);
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await server.connect(transport);const response=await transport.handleRequest(request,{parsedBody:body});for(const[k,v]of Object.entries(headers))response.headers.set(k,v);return response}
  catch{return json({error:'MCP-Anfrage fehlgeschlagen.'},500)}
  finally{await server.close()}
 };
}
