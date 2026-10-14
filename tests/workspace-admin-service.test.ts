import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createWorkspaceAdminService } from '../src/shared/workspace-admin-service.js';
import { registerWorkspaceAdminTools } from '../src/server/workspace-admin-mcp.js';
import type { ToolRegistrar } from '../src/server/finance-mcp.js';
const id='10000000-0000-4000-8000-000000000001';
const summary={id,name:'Ä Studio 工作室',is_demo:true,archived_at:'2026-10-14T10:00:00Z',created_at:'2026-10-13T12:00:00Z',counts:{projects:17,tasks:102,time_entries:140,members:11,invoices:4,expenses:5},running_timers:0,issued_invoices:0};
function fixture(response:unknown,status=200) {
 const requests:{url:string;body:unknown}[]=[];
 const client=createClient('https://example.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  requests.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
  return new Response(response===undefined?null:JSON.stringify(response),{status,headers:{'content-type':'application/json'}});
 }}});
 return {service:createWorkspaceAdminService(client),requests};
}
describe('workspace admin service and tool boundary',()=>{
 it('loads active and archived owner summaries only through the dedicated RPC',async()=>{
  const {service,requests}=fixture([summary]);expect(await service.listOwned()).toEqual([summary]);
  expect(requests[0]?.url).toBe('https://example.supabase.co/rest/v1/rpc/list_owned_workspaces');
 });
 it('preserves the exact confirmation and uses explicit true in the deletion RPC',async()=>{
  const {service,requests}=fixture(undefined);await service.deleteWorkspace({workspaceId:id,confirmationName:' Ä Studio 工作室 ',confirmed:true});
  expect(requests).toEqual([{url:'https://example.supabase.co/rest/v1/rpc/delete_workspace',body:{p_workspace_id:id,p_confirmation_name:' Ä Studio 工作室 ',p_confirmed:true}}]);
 });
 it('rejects invalid identities, absent/false confirmation and extra input without making a request',async()=>{
  const {service,requests}=fixture(undefined);
  for(const input of [{workspaceId:'bad',confirmationName:'Studio',confirmed:true},{workspaceId:id,confirmationName:'Studio'},{workspaceId:id,confirmationName:'Studio',confirmed:false},{workspaceId:id,confirmationName:'Studio',confirmed:'true'},{workspaceId:id,confirmationName:'',confirmed:true},{workspaceId:id,confirmationName:'x'.repeat(121),confirmed:true},{workspaceId:id,confirmationName:'Studio',confirmed:true,force:true}])
   await expect(service.deleteWorkspace(input as never)).rejects.toMatchObject({code:'confirmation'});
  expect(requests).toHaveLength(0);
 });
 it.each([['42501','private secret','forbidden'],['P0001','WORKSPACE_ADMIN_CONFIRMATION','confirmation'],['P0001','WORKSPACE_ADMIN_RUNNING_TIMERS','running_timers'],['P0001','WORKSPACE_ADMIN_GOBD_RECORDS','gobd_records'],['P0001','WORKSPACE_ADMIN_NOT_FOUND','not_found'],['XX000','private_secret_table','failed']])('maps %s/%s to controlled %s errors',async(code,message,expected)=>{
  const {service}=fixture({code,message},400);await expect(service.deleteWorkspace({workspaceId:id,confirmationName:'Studio',confirmed:true})).rejects.toMatchObject({code:expected});
  await expect(service.listOwned()).rejects.not.toThrow(/private.secret/);
 });
 it('rejects malformed summaries instead of rendering untrusted response shapes',async()=>{
  const {service}=fixture([{...summary,counts:{...summary.counts,invoices:-1}}]);await expect(service.listOwned()).rejects.toMatchObject({code:'failed'});
 });
 it('registers a read-only preview and a non-idempotent destructive tool with exact confirmation',async()=>{
  const {service,requests}=fixture(undefined);const entries=new Map<string,Parameters<ToolRegistrar>>();
  registerWorkspaceAdminTools((...args)=>{entries.set(args[0],args)},service);
  expect(entries.get('list_owned_workspaces')?.[3]).toBe(true);
  const deletion=entries.get('delete_workspace')!;expect(deletion[3]).toBe(false);expect(deletion[5]).toBe(true);expect(deletion[6]).toBe(false);
  expect(deletion[1]).toMatch(/explicit.*confirm/i);expect(deletion[1]).toMatch(/counts/i);
  expect((deletion[2].confirmed as z.ZodType).safeParse(false).success).toBe(false);
  await deletion[4]({workspace_id:id,confirmation_name:'Studio',confirmed:true});
  expect(requests[0]?.body).toEqual({p_workspace_id:id,p_confirmation_name:'Studio',p_confirmed:true});
 });
});
