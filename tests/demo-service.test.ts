import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createDemoService } from '../src/shared/demo-service.js';

const id='10000000-0000-4000-8000-000000000001';
const workspace={id,name:'VAVE demo',timezone:'Europe/Berlin',currency:'EUR',created_by:id,created_at:'2026-10-13T12:00:00Z'};
function fixture(response:unknown,status=200) {
  const requests:{url:string;body:unknown}[]=[];
  const client=createClient('https://example.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
    return new Response(response===undefined?null:JSON.stringify(response),{status,headers:{'content-type':'application/json'}});
  }}});
  return {service:createDemoService(client),requests};
}
describe('demo service boundary',()=>{
  it('creates a workspace through the authenticated RPC while preserving the retry token',async()=>{
    const {service,requests}=fixture(workspace);
    expect(await service.create({name:' VAVE demo ',timezone:'Europe/Berlin',locale:'zh',requestId:id})).toEqual(workspace);
    expect(requests[0]?.body).toEqual({p_name:'VAVE demo',p_timezone:'Europe/Berlin',p_locale:'zh',p_request_id:id});
  });
  it('upgrades only through the authenticated workspace-scoped RPC',async()=>{
    const {service,requests}=fixture(undefined);
    await service.upgrade(id);
    expect(requests).toEqual([{url:'https://example.supabase.co/rest/v1/rpc/demo_upgrade_workspace',body:{p_workspace_id:id}}]);
    await expect(service.upgrade('invalid')).rejects.toMatchObject({code:'validation'});
    expect(requests).toHaveLength(1);
  });
  it('returns null for absent or RLS-hidden metadata',async()=>{
    const {service}=fixture([]); expect(await service.get(id)).toBeNull();
  });
  it('rejects malformed IDs and locale before contacting the database',async()=>{
    const {service,requests}=fixture(workspace);
    await expect(service.get('invalid')).rejects.toMatchObject({code:'validation'});
    await expect(service.create({name:'Demo',timezone:'UTC',locale:'fr' as 'en',requestId:id})).rejects.toMatchObject({code:'validation'});
    expect(requests).toHaveLength(0);
  });
  it('maps a running timer conflict to a controlled actionable message',async()=>{
    const {service}=fixture({code:'P0001',message:'DEMO_CONFLICT: Stop or discard running timers before archiving.'},400);
    await expect(service.archive(id)).rejects.toMatchObject({code:'conflict',message:expect.stringMatching(/stop or discard.*timer/i)});
  });
  it('does not disclose arbitrary database errors',async()=>{
    const {service}=fixture({code:'XX000',message:'database_secret_internal_table'},500);
    await expect(service.get(id)).rejects.toMatchObject({code:'database',message:'The demo workspace could not be loaded or saved.'});
  });
});
