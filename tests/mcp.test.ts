import {describe,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpHandler,validateClaims} from '../src/server/http.js';
import {ConnectorError,type ConnectorService} from '../src/server/connector.js';

const config={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test',appUrl:'https://log.example.com',configured:true};
const workspace='11111111-1111-4111-8111-111111111111';
const clientId='22222222-2222-4222-8222-222222222222';

function handler(service:Partial<ConnectorService>,audit=vi.fn()){
  return createHttpHandler(config,{audit,authenticate:async()=>({userId:workspace,clientId,service:{
    workspaces:async()=>[{id:workspace}],read:async()=>[],propose:async()=>[],...service
  }})});
}
async function connect(service:Partial<ConnectorService>){
  const handle=handler(service);
  const transport=new StreamableHTTPClientTransport(new URL(config.appUrl+'/api/mcp'),{
    requestInit:{headers:{Authorization:'Bearer test-token'}},
    fetch:async(input,init)=>handle(new Request(input,init))
  });
  const client=new Client({name:'test-client',version:'1.0.0'});
  await client.connect(transport);
  return client;
}
describe('deployed MCP connection',()=>{
  it('advertises only approved reads and reviewable proposals',async()=>{
    const client=await connect({});
    try{
      const {tools}=await client.listTools();
      expect(tools.map(t=>t.name).sort()).toEqual([
        'list_absences','list_projects','list_tasks','list_time_entries','list_workspaces','propose_time_entries'
      ]);
      expect(tools.find(t=>t.name==='propose_time_entries')?.annotations?.idempotentHint).toBe(true);
      expect(tools.find(t=>t.name==='list_projects')?.annotations?.readOnlyHint).toBe(true);
    }finally{await client.close()}
  });
  it('marks data and routes a validated read through the scoped service',async()=>{
    const read=vi.fn(async()=>[{id:workspace,name:'VAVE project'}]);
    const client=await connect({read});
    try{
      const result=await client.callTool({name:'list_projects',arguments:{workspace_id:workspace}});
      expect(result.structuredContent).toEqual({data:[{id:workspace,name:'VAVE project'}],provenance:'untrusted_workspace_data'});
      expect(read).toHaveBeenCalledWith('projects',{workspace_id:workspace});
    }finally{await client.close()}
  });
  it('requires at least one approved workspace before serving MCP',async()=>{
    const audit=vi.fn();
    const handle=handler({workspaces:async()=>[]},audit);
    const response=await handle(new Request(config.appUrl+'/api/mcp',{
      method:'POST',headers:{authorization:'Bearer test-token','content-type':'application/json'},body:'{}'
    }));
    expect(response.status).toBe(403);
    expect(audit).toHaveBeenCalledWith({event:'forbidden',clientId,requestId:response.headers.get('x-request-id')});
  });
  it('returns safe errors for refused scopes',async()=>{
    const client=await connect({read:async()=>{throw new ConnectorError('forbidden')}});
    try{
      const result=await client.callTool({name:'list_tasks',arguments:{workspace_id:workspace}});
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('permission');
    }finally{await client.close()}
  });
});

describe('verified OAuth claims',()=>{
  const claims={iss:config.supabaseUrl+'/auth/v1',aud:'authenticated',role:'authenticated',session_id:'00000000-0000-4000-8000-000000000011',sub:workspace,client_id:clientId,exp:Date.now()/1000+60};
  it('accepts confirmed user subjects only in a specific OAuth client context',()=>{
    expect(validateClaims(claims,config)).toBe(workspace);
    for(const change of [{iss:'https://other.supabase.co/auth/v1'},{aud:'other'},{role:'service_role'},{sub:'bad'},{client_id:null},{exp:0},{is_anonymous:true}])
      expect(()=>validateClaims({...claims,...change},config)).toThrow();
  });
});
