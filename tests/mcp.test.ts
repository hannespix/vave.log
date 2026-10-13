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
 it('initializes and exposes safe tools with annotations',async()=>{const c=await connect({});try{const{tools}=await c.listTools();expect(tools.length).toBe(20);expect(tools.find(t=>t.name==='delete_time_entry')?.annotations?.destructiveHint).toBe(true);expect(tools.find(t=>t.name==='list_projects')?.annotations?.readOnlyHint).toBe(true);expect(tools.some(t=>/sql|shell|exec/.test(t.name))).toBe(false)}finally{await c.close()}});
 it('uses the acting user service and validates tool inputs',async()=>{const listProjects=vi.fn(async()=>[{id,name:'VAVE project'}] as never);const c=await connect({listProjects});try{const result=await c.callTool({name:'list_projects',arguments:{workspace_id:id}});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('VAVE project');expect(listProjects).toHaveBeenCalledWith(id);const invalid=await c.callTool({name:'list_projects',arguments:{workspace_id:'not-uuid'}});expect(invalid.isError).toBe(true);expect(listProjects).toHaveBeenCalledTimes(1)}finally{await c.close()}});
 it('returns denied writes as tool errors without success',async()=>{const c=await connect({deleteEntry:async()=>{throw new AppError('Dafür fehlt die Berechtigung.','42501')}});try{const result=await c.callTool({name:'delete_time_entry',arguments:{id}});expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain('permission')}finally{await c.close()}});
});
describe('token claims boundary after signature verification',()=>{
 const claims={iss:config.supabaseUrl+'/auth/v1',aud:'authenticated',role:'authenticated',sub:id,exp:Date.now()/1000+60};
 it('accepts user access claims only',()=>{expect(validateClaims(claims,config)).toBe(id);for(const change of [{iss:'https://other.supabase.co/auth/v1'},{aud:'other'},{role:'service_role'},{sub:'bad'},{exp:0},{is_anonymous:true}])expect(()=>validateClaims({...claims,...change},config)).toThrow()});
});
