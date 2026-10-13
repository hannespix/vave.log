import {describe,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpHandler} from '../src/server/http.js';
import {AppError,type Service} from '../src/shared/service.js';
import type {FinanceService} from '../src/shared/finance-service.js';
const id='11111111-1111-4111-8111-111111111111';
const config={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test',appUrl:'https://log.example.com',configured:true};
async function connect(finance:Partial<FinanceService>,locale='en',service:Partial<Service>={}){
 const handler=createHttpHandler(config,{authenticate:async()=>({userId:id,service:service as Service,finance:finance as FinanceService})});
 const transport=new StreamableHTTPClientTransport(new URL(config.appUrl+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer test-token','Accept-Language':locale}},fetch:async(input,init)=>handler(new Request(input,init))});
 const client=new Client({name:'agency-test',version:'1.0.0'});await client.connect(transport);return client;
}
describe('agency MCP wire contract',()=>{
 it('offers financial tools with reviewable effect annotations',async()=>{
  const c=await connect({});try{const {tools}=await c.listTools();
   expect(tools.find(t=>t.name==='finance_overview')?.annotations?.readOnlyHint).toBe(true);
   expect(tools.find(t=>t.name==='finance_issue_invoice')?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:true});
   expect(tools.find(t=>t.name==='finance_save_profile')?.description).toContain('Owner');
   expect(tools.find(t=>t.name==='finance_cancel_invoice')?.description).toContain('immutable');
  }finally{await c.close()}
 });
 it('reads actual service data without translating customer text or allowing extra write fields',async()=>{
  const saveClient=vi.fn(async(value)=>({...value,id,created_at:''}));const c=await connect({saveClient},'zh-CN');
  try{const args={workspace_id:id,name:'Original 客户',billing_address:'',contact_email:'',tax_id:'',language:'de',response_locale:'de'};
   const result=await c.callTool({name:'finance_save_client',arguments:args});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('Original 客户');
   const {response_locale,...saved}=args;expect(saveClient).toHaveBeenCalledWith(saved);
   const denied=await c.callTool({name:'finance_save_client',arguments:{...args,status:'issued'}});expect(denied.isError).toBe(true);expect(saveClient).toHaveBeenCalledTimes(1);
  }finally{await c.close()}
 });
 it('uses localized safe errors and never returns backend diagnostics',async()=>{
  const c=await connect({},'en',{deleteEntry:async()=>{throw new AppError('Dafür fehlt die Berechtigung.','42501')}});
  try{let r=await c.callTool({name:'delete_time_entry',arguments:{id}});expect(JSON.stringify(r)).toContain('permission');
   r=await c.callTool({name:'delete_time_entry',arguments:{id,response_locale:'zh'}});expect(JSON.stringify(r)).toContain('权限');
  }finally{await c.close()}
  const other=await connect({issueInvoice:async()=>{throw Error('private SQL / secret')}});
  try{const r=await other.callTool({name:'finance_issue_invoice',arguments:{workspace_id:id,id}});expect(r.isError).toBe(true);expect(JSON.stringify(r)).not.toContain('secret')}finally{await other.close()}
 });
 it('chooses English for unsupported primary languages, ignoring fallback entries',async()=>{
  const h=createHttpHandler(config);
  for(const [language,message]of [['fr-FR,de;q=0.9','Please sign in.'],['de-DE,en;q=0.5','Bitte anmelden.'],['zh-TW','请登录。']]){
   const r=await h(new Request(config.appUrl+'/api/mcp',{method:'POST',headers:{'accept-language':language}}));expect(await r.json()).toEqual({error:message});
  }
 });
});
