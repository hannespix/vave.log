import {describe,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpHandler} from '../src/server/http.js';
import {AppError,type Service} from '../src/shared/service.js';
import type {FinanceService} from '../src/shared/finance-service.js';
import {WorkspaceAdminError,type WorkspaceAdminService} from '../src/shared/workspace-admin-service.js';
import type {DemoService} from '../src/shared/demo-service.js';
const id='11111111-1111-4111-8111-111111111111';
const config={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test',appUrl:'https://log.example.com',configured:true};
async function connect(finance:Partial<FinanceService>,locale='en',service:Partial<Service>={},demo?:Partial<DemoService>,workspaceAdmin?:Partial<WorkspaceAdminService>){
 const handler=createHttpHandler(config,{authenticate:async()=>({userId:id,service:service as Service,finance:finance as FinanceService,...(demo?{demo:demo as DemoService}:{}),...(workspaceAdmin?{workspaceAdmin:workspaceAdmin as WorkspaceAdminService}:{})})});
 const transport=new StreamableHTTPClientTransport(new URL(config.appUrl+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer test-token','Accept-Language':locale}},fetch:async(input,init)=>handler(new Request(input,init))});
 const client=new Client({name:'agency-test',version:'1.0.0'});await client.connect(transport);return client;
}
describe('agency MCP wire contract',()=>{
 it('exposes complete demo enrichment with strict input and the same scoped service',async()=>{
  const upgrade=vi.fn(async()=>{});const c=await connect({},'en',{}, {upgrade});
  try{const {tools}=await c.listTools();expect(tools).toHaveLength(45);
   expect(tools.find(t=>t.name==='demo_upgrade_workspace')?.annotations).toMatchObject({readOnlyHint:false,idempotentHint:true});
   expect(tools.find(t=>t.name==='demo_create_workspace')?.description).toContain('non-login');
   const ok=await c.callTool({name:'demo_upgrade_workspace',arguments:{workspace_id:id}});expect(ok.isError).not.toBe(true);expect(upgrade).toHaveBeenCalledWith(id);
   const denied=await c.callTool({name:'demo_upgrade_workspace',arguments:{workspace_id:id,is_demo:false}});expect(denied.isError).toBe(true);expect(upgrade).toHaveBeenCalledTimes(1);
  }finally{await c.close()}
 });
 it('exposes owner deletion with exact confirmation, destructive annotations and no extra fields',async()=>{
  const listOwned=vi.fn(async()=>[]),deleteWorkspace=vi.fn(async()=>{});
  const c=await connect({},'en',{}, {},{listOwned,deleteWorkspace});
  try{const {tools}=await c.listTools();expect(tools).toHaveLength(47);
   expect(tools.find(t=>t.name==='list_owned_workspaces')?.annotations?.readOnlyHint).toBe(true);
   expect(tools.find(t=>t.name==='delete_workspace')?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:false});
   await c.callTool({name:'list_owned_workspaces',arguments:{}});expect(listOwned).toHaveBeenCalledOnce();
   for(const args of [{workspace_id:id,confirmation_name:'Demo'},{workspace_id:id,confirmation_name:'Demo',confirmed:false},{workspace_id:id,confirmation_name:'Demo',confirmed:true,force:true}]){
    expect((await c.callTool({name:'delete_workspace',arguments:args})).isError).toBe(true);
   }
   expect(deleteWorkspace).not.toHaveBeenCalled();
   expect((await c.callTool({name:'delete_workspace',arguments:{workspace_id:id,confirmation_name:'Demo',confirmed:true}})).isError).not.toBe(true);
   expect(deleteWorkspace).toHaveBeenCalledWith({workspaceId:id,confirmationName:'Demo',confirmed:true});
  }finally{await c.close()}
 });
 it('explains owner deletion blockers in the requested language without leaking diagnostics',async()=>{
  const c=await connect({},'en',{}, {},{deleteWorkspace:async()=>{throw new WorkspaceAdminError('running_timers')}});
  try{for(const [locale,message] of [['en','running timers'],['de','laufenden Timer'],['zh','计时器']]){
   const result=await c.callTool({name:'delete_workspace',arguments:{workspace_id:id,confirmation_name:'Demo',confirmed:true,response_locale:locale}});
   expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain(message);
  }}finally{await c.close()}
 });
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
