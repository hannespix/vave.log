import {describe,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpHandler,validateClaims} from '../src/server/http.js';
import {AppError,type Service} from '../src/shared/service.js';
const config={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test',appUrl:'https://log.example.com',configured:true};
const id='11111111-1111-4111-8111-111111111111';
async function connect(service:Partial<Service>){
 const handler=createHttpHandler(config,{authenticate:async()=>({userId:id,service:service as Service})});
 const transport=new StreamableHTTPClientTransport(new URL(config.appUrl+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer test-token'}},fetch:async(input,init)=>handler(new Request(input,init))});
 const client=new Client({name:'test-client',version:'1.0.0'});await client.connect(transport);return client;
}
describe('real MCP wire protocol',()=>{
 it('initializes and exposes safe tools with annotations',async()=>{const c=await connect({});try{const{tools}=await c.listTools();expect(tools.length).toBe(32);expect(tools.find(t=>t.name==='delete_time_entry')?.annotations?.destructiveHint).toBe(true);expect(tools.find(t=>t.name==='list_projects')?.annotations?.readOnlyHint).toBe(true);expect(tools.some(t=>/sql|shell|exec/.test(t.name))).toBe(false)}finally{await c.close()}});
 it('uses the acting user service and validates tool inputs',async()=>{const listProjects=vi.fn(async()=>[{id,name:'VAVE project'}] as never);const c=await connect({listProjects});try{const result=await c.callTool({name:'list_projects',arguments:{workspace_id:id}});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('VAVE project');expect(listProjects).toHaveBeenCalledWith(id);const invalid=await c.callTool({name:'list_projects',arguments:{workspace_id:'not-uuid'}});expect(invalid.isError).toBe(true);expect(listProjects).toHaveBeenCalledTimes(1)}finally{await c.close()}});
 it('returns denied writes as tool errors without success',async()=>{const c=await connect({deleteEntry:async()=>{throw new AppError('Dafür fehlt die Berechtigung.','42501')}});try{const result=await c.callTool({name:'delete_time_entry',arguments:{id}});expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain('permission')}finally{await c.close()}});
});
describe('token claims boundary after signature verification',()=>{
 const claims={iss:config.supabaseUrl+'/auth/v1',aud:'authenticated',role:'authenticated',sub:id,exp:Date.now()/1000+60};
 it('accepts user access claims only',()=>{expect(validateClaims(claims,config)).toBe(id);for(const change of [{iss:'https://other.supabase.co/auth/v1'},{aud:'other'},{role:'service_role'},{sub:'bad'},{exp:0},{is_anonymous:true}])expect(()=>validateClaims({...claims,...change},config)).toThrow()});
});

describe('project analysis MCP contract',()=>{
 it('advertises the read-only insight operation and writable planning fields only',async()=>{
  const c=await connect({});try{const {tools}=await c.listTools();
   expect(tools.find(t=>t.name==='get_project_insight')?.annotations?.readOnlyHint).toBe(true);
   const properties=tools.find(t=>t.name==='save_project')?.inputSchema.properties;
   expect(properties).toHaveProperty('due_date');expect(properties).toHaveProperty('progress_percent');expect(properties).not.toHaveProperty('progress_updated_at');
   const taskProperties=tools.find(t=>t.name==='save_task')?.inputSchema.properties;expect(taskProperties).toHaveProperty('estimated_minutes');expect(taskProperties).toHaveProperty('is_milestone');
  }finally{await c.close()}
 });
 it('routes analysis through the signed-in service and returns denied reads as errors',async()=>{
  const getProjectInsight=vi.fn(async()=>({project:{id,workspace_id:id,status:'active',budget_minutes:3000,progress_percent:99,due_date:'2026-12-01'},as_of:'2026-10-14',progress_date:'2026-10-14',total_minutes:600,first_work_date:'2026-10-01',last_work_date:'2026-10-13',recent_daily:[{work_date:'2026-10-01',minutes:200},{work_date:'2026-10-08',minutes:200},{work_date:'2026-10-13',minutes:200}],tasks:{total:4,done:1,overdue:0}} as never));
  const c=await connect({getProjectInsight});try{
   const result=await c.callTool({name:'get_project_insight',arguments:{workspace_id:id,project_id:id}});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('600');expect(JSON.stringify(result)).toContain('projectedTotalMinutes');expect(JSON.stringify(result)).toContain('2400');expect(JSON.stringify(result)).toContain('task-count');expect(JSON.stringify(result)).toContain('missingEstimates');expect(getProjectInsight).toHaveBeenCalledWith(id,id);
   const bad=await c.callTool({name:'get_project_insight',arguments:{workspace_id:id,project_id:'fake'}});expect(bad.isError).toBe(true);expect(getProjectInsight).toHaveBeenCalledTimes(1);
  }finally{await c.close()}
  const denied=await connect({getProjectInsight:async()=>{throw new AppError('Dafür fehlt die Berechtigung.','42501')}});
  try{const result=await denied.callTool({name:'get_project_insight',arguments:{workspace_id:id,project_id:id}});expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain('permission')}finally{await denied.close()}
 });
});
