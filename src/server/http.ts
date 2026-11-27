import {createClient} from '@supabase/supabase-js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {ConnectorError,createConnectorServer,createConnectorService,type ConnectorService} from './connector.js';
import {uuid} from '../shared/validation.js';
import {resolveLocale} from '../shared/i18n.js';
import {serverMessage} from './messages.js';

export interface Config {supabaseUrl:string;supabasePublishableKey:string;appUrl:string;configured:boolean;mcpDisabled?:boolean}
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
 return {supabaseUrl:supabaseUrl.replace(/\/$/,''),supabasePublishableKey:key,appUrl:app.origin,configured:Boolean(supabaseUrl&&key),mcpDisabled:env.MCP_DISABLED==='true'};
}
export function securityHeaders(config:Config):Record<string,string>{
 const connect=config.supabaseUrl?` ${new URL(config.supabaseUrl).origin}`:'';
 return {'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()','cache-control':'no-store','content-security-policy':`default-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'${connect}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,...(config.appUrl.startsWith('https:')?{'strict-transport-security':'max-age=31536000'}:{})};
}
type Principal={userId:string;clientId:string;service:ConnectorService};
type AuditRecord={event:string;requestId:string;clientId?:string;tool?:string};
type Deps={
  authenticate?:(token:string,signal:AbortSignal)=>Promise<Principal>;
  audit?:(record:AuditRecord)=>void;
};
type Rate={since:number;count:number};
const requestLimit=65_536;
const responseLimit=262_144;

export function validateClaims(claims:Record<string,unknown>,config:Config){
  const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==config.supabaseUrl+'/auth/v1'||!audiences.includes('authenticated')||
    claims.role!=='authenticated'||typeof claims.sub!=='string'||!uuid.safeParse(claims.sub).success||
    !uuid.safeParse(claims.client_id).success||!uuid.safeParse(claims.session_id).success||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||
    claims.exp<=Date.now()/1000||claims.is_anonymous===true)throw Error('Invalid OAuth access token');
  return claims.sub;
}

class SizeError extends Error {}
async function boundedStream(stream:ReadableStream<Uint8Array>|null,max:number,signal:AbortSignal){
  if(!stream)return null;
  const reader=stream.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>undefined)};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    let size=0;
    const parts:Uint8Array[]=[];
    for(;;){
      signal.throwIfAborted();
      const {value,done}=await reader.read();
      signal.throwIfAborted();
      if(done)break;
      size+=value.byteLength;
      if(size>max){cancel();throw new SizeError()}
      parts.push(value);
    }
    const data=new Uint8Array(size);
    let offset=0;
    for(const part of parts){data.set(part,offset);offset+=part.byteLength}
    return data;
  }finally{
    signal.removeEventListener('abort',cancel);
    reader.releaseLock();
  }
}
function allowRate(map:Map<string,Rate>,key:string,limit:number,now:number){
  if(map.size>=5000){
    for(const [id,rate] of map)if(now-rate.since>=60_000)map.delete(id);
    if(map.size>=5000&&!map.has(key))return false;
  }
  let rate=map.get(key);
  if(!rate||now-rate.since>=60_000){rate={since:now,count:0};map.set(key,rate)}
  return ++rate.count<=limit;
}
function upstreamError(error:{name?:string;status?:number}|null){
  return !!error&&(error.name==='AuthRetryableFetchError'||error.status===0||(error.status??0)>=500);
}

export function createHttpHandler(config:Config,deps:Deps={}){
  const origin=new URL(config.appUrl);
  const headers=securityHeaders(config);
  const resource=config.appUrl+'/api/mcp';
  const metadata=config.appUrl+'/.well-known/oauth-protected-resource/api/mcp';
  const audit=deps.audit??(record=>console.info(JSON.stringify(record)));
  const authenticate=deps.authenticate??(async(token:string,signal:AbortSignal):Promise<Principal>=>{
    const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{
        ...init,signal:init?.signal?AbortSignal.any([signal,init.signal]):signal
      })}
    });
    const {data,error}=await client.auth.getClaims(token);
    if(upstreamError(error))throw new ConnectorError('auth_unavailable');
    if(error||!data||!['ES256','RS256'].includes(data.header.alg))throw Error('Invalid OAuth access token');
    const userId=validateClaims(data.claims,config);
    const clientId=String(data.claims.client_id);
    return {userId,clientId,service:createConnectorService(client)};
  });
  const attempts=new Map<string,Rate>();
  const clientCalls=new Map<string,Rate>();
  const userCalls=new Map<string,Rate>();
  const running=new Map<string,number>();
  let pending=0;

  return async(request:Request,trustedClientKey='shared'):Promise<Response>=>{
    const locale=resolveLocale((request.headers.get('accept-language')??'en').split(',')[0].split(';')[0]);
    const msg=(key:Parameters<typeof serverMessage>[0])=>serverMessage(key,locale);
    const json=(data:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{
      status,headers:{...headers,'content-type':'application/json; charset=utf-8',...extra}
    });
    const url=new URL(request.url);
    const path=url.pathname;
    if((request.headers.get('host')||url.host)!==origin.host)return json({error:msg('host')},403);
    const sentOrigin=request.headers.get('origin');
    if(sentOrigin&&sentOrigin!==origin.origin)return json({error:msg('origin')},403);
    if(path==='/api/config'&&request.method==='GET')return json({
      appUrl:config.appUrl,supabaseUrl:config.supabaseUrl,supabasePublishableKey:config.supabasePublishableKey,configured:config.configured,
      mcpAvailable:config.configured&&!config.mcpDisabled
    });
    if(path==='/healthz'&&request.method==='GET')return json({status:config.configured?'configured':'setup_required',version:'1.0.0'},config.configured?200:503);
    if((path==='/.well-known/oauth-protected-resource/api/mcp'||path==='/.well-known/oauth-protected-resource')&&request.method==='GET'){
      return config.configured&&!config.mcpDisabled?json({resource,authorization_servers:[config.supabaseUrl+'/auth/v1'],
        bearer_methods_supported:['header'],resource_name:'VAVE.LOG',resource_documentation:config.appUrl+'/help/mcp'})
        :json({error:msg('setup')},503);
    }
    if(path!=='/api/mcp')return json({error:msg('missing')},404);
    if(!config.configured||config.mcpDisabled)return json({error:msg('setup')},503);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,Allow:'POST, OPTIONS'}});
    if(request.method!=='POST')return json({error:msg('method')},405,{Allow:'POST, OPTIONS'});

    const requestId=crypto.randomUUID();
    let clientId:string|undefined;
    function record(event:string,tool?:string){audit({event,requestId,...(clientId?{clientId}:{}),...(tool?{tool}:{})})}
    function reject(key:Parameters<typeof msg>[0],status:number,event=key,extra:Record<string,string>={}){
      record(event);
      return json({error:msg(key)},status,{'x-request-id':requestId,...extra});
    }
    const challenge=()=>reject('signin',401,'signin',{'www-authenticate':`Bearer resource_metadata="${metadata}"`});
    const limited=()=>reject('limited',429,'limited',{'retry-after':'60'});
    const now=Date.now();
    // Both the global and source limits apply before any provider request.
    if(!allowRate(attempts,'source:'+trustedClientKey,180,now)||!allowRate(attempts,'global',1000,now))return limited();
    const match=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{1,8192})$/i);
    if(!match)return challenge();
    if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return reject('json',415);
    if(Number(request.headers.get('content-length'))>requestLimit)return reject('invalid',413);
    if(pending>=24)return reject('busy',503);
    pending++;
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10_000)]);
    let runningKey:string|undefined;
    try{
      let body:unknown;
      try{body=JSON.parse(new TextDecoder().decode(await boundedStream(request.body,requestLimit,signal)??undefined))}
      catch(error){
        if(signal.aborted)return reject('deadline',504);
        return reject('invalid',error instanceof SizeError?413:400);
      }
      if(Array.isArray(body))return reject('batch',400);
      let principal:Principal;
      try{principal=await authenticate(match[1],signal)}
      catch(error){
        if(signal.aborted)return reject('deadline',504);
        if(error instanceof ConnectorError&&error.code==='auth_unavailable')return reject('auth_unavailable',503);
        return challenge();
      }
      clientId=principal.clientId;
      const key=principal.userId+':'+clientId;
      if(!allowRate(clientCalls,clientId,240,Date.now())||!allowRate(userCalls,key,120,Date.now()))return limited();
      if((running.get(key)??0)>=2)return reject('busy',503);
      runningKey=key;
      running.set(key,(running.get(key)??0)+1);

      try{
        if(!(await principal.service.workspaces()).length)return reject('forbidden',403);
      }catch(error){
        if(signal.aborted)return reject('deadline',504);
        if(error instanceof ConnectorError&&error.code==='forbidden')return reject('forbidden',403);
        return reject('auth_unavailable',503);
      }

      const server=createConnectorServer(principal.service,locale,(tool,outcome)=>record('tool_'+outcome,tool));
      const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      try{
        await server.connect(transport);
        const response=await transport.handleRequest(request,{parsedBody:body});
        const result=await boundedStream(response.body,responseLimit,signal);
        const responseHeaders=new Headers(response.headers);
        for(const[k,v]of Object.entries(headers))responseHeaders.set(k,v);
        responseHeaders.set('x-request-id',requestId);
        return new Response(result,{status:response.status,headers:responseHeaders});
      }catch(error){
        if(signal.aborted)return reject('deadline',504);
        if(error instanceof SizeError)return reject('result_limit',413);
        return reject('failed',500);
      }finally{
        await server.close().catch(()=>record('transport_close_failed'));
      }
    }finally{
      pending--;
      if(runningKey){
        const remaining=(running.get(runningKey)??1)-1;
        if(remaining)running.set(runningKey,remaining);
        else running.delete(runningKey);
      }
    }
  };
}
