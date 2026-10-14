import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let db:PGlite;
const rows=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner,role='authenticated') {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`)}
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const r=await rows(sql,args);await db.exec('release savepoint expected_failure');return r}catch(e){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw e}}
const create=(name='Delete fixture') => one<{id:string;name:string}>("select * from public.demo_create_workspace($1,'UTC','en',gen_random_uuid())",[name]);
const remove=(w:{id:string;name:string}) => rows('select public.delete_workspace($1,$2,true)',[w.id,w.name]);
const list=async()=> (await one<{v:any[]}>('select public.list_owned_workspaces() v')).v;
async function snapshot(workspace:string):Promise<Record<string,Record<string,unknown>[]>> {
 await db.exec('reset role');
 const tables=await rows<{schema:string;name:string}>("select table_schema schema,table_name name from information_schema.columns where column_name='workspace_id' and table_schema in ('public','private') order by 1,2");
 return Object.fromEntries(await Promise.all(tables.map(async t=>[`${t.schema}.${t.name}`,await rows(`select to_jsonb(t) v from ${t.schema}.${t.name} t where workspace_id=$1 order by to_jsonb(t)::text`,[workspace])])));
}
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.org',now()),($2,'other@example.org',now())",[owner,other]);
},60000);
afterAll(async()=>{await db?.close()});beforeEach(async()=>{await db.exec('begin');await login()});afterEach(async()=>{await db.exec('rollback')});

describe('permanent workspace administration',()=>{
 it('lists only real owner memberships including archived demos, with exact counts',async()=>{
  const active=await create(),archived=await create('Archived');await db.query('select public.demo_archive_workspace($1)',[archived.id]);
  await login(other);await create('Other private studio');await login();
  const result=await list();expect(result).toHaveLength(2);
  expect(result.find(w=>w.id===active.id)).toMatchObject({name:active.name,is_demo:true,archived_at:null,running_timers:0,counts:{projects:25,tasks:102}});
  expect(result.find(w=>w.id===archived.id)?.archived_at).toBeTruthy();
  expect(Object.keys(result[0]).sort()).toEqual(['archived_at','counts','created_at','id','is_demo','name','running_timers']);
 });
 it.each([false,true])('removes all business records from a populated demo (archived=%s), retaining accounts and other workspaces',async archived=>{
  const w=await create(),keep=await create('Keep');if(archived)await db.query('select public.demo_archive_workspace($1)',[w.id]);
  const before=await snapshot(keep.id);await login();await remove(w);
  expect(Object.values(await snapshot(w.id)).every(v=>v.length===0)).toBe(true);
  expect(await rows('select id from public.workspaces where id=$1',[w.id])).toEqual([]);
  expect(await rows('select id from auth.users')).toHaveLength(2);expect(await snapshot(keep.id)).toEqual(before);
 });
 it('rejects wrong case, missing confirmation and altered Unicode/whitespace without deleting anything',async()=>{
  const w=await create('Ä Studio 工作室');const before=await snapshot(w.id);await login();
  for(const [name,confirmed] of [[w.name,false],[w.name,null],['ä Studio 工作室',true],[w.name+' ',true],['Ä Studio 工作室',true],[null,true]])
   await expect(attempt('select public.delete_workspace($1,$2,$3)',[w.id,name,confirmed])).rejects.toThrow(/WORKSPACE_ADMIN_CONFIRMATION/);
  expect(await snapshot(w.id)).toEqual(before);
 });
 it('blocks current running timers even when a preview previously showed none',async()=>{
  const w=await create();expect((await list())[0].running_timers).toBe(0);
  const p=await one<{id:string}>("select id from public.projects where workspace_id=$1 and status='active' limit 1",[w.id]);
  const t=await one<{id:string}>('select * from public.start_timer($1,$2,\'Keep my time\',true)',[w.id,p.id]);
  expect((await list())[0].running_timers).toBe(1);await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/WORKSPACE_ADMIN_RUNNING_TIMERS/);
  expect(await rows('select id from public.running_timers where id=$1',[t.id])).toHaveLength(1);
  await db.query('select public.discard_timer($1)',[t.id]);await remove(w);
 });
 it.each(['manager','member','disabled'])('denies %s and does not list their workspace',async role=>{
  const w=await create();await db.query("select public.invite_member($1,'other@example.org','manager')",[w.id]);await login(other);await db.exec('select public.accept_invitations()');await login();await db.query('select public.set_member_role($1,$2,$3)',[w.id,other,role]);await login(other);
  expect(await list()).toEqual([]);await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/WORKSPACE_ADMIN_FORBIDDEN/);
 });
 it('denies outsiders, unverified users and anonymous callers',async()=>{
  const w=await create();await login(other);expect(await list()).toEqual([]);await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/WORKSPACE_ADMIN_FORBIDDEN/);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);await login();
  await expect(attempt('select public.list_owned_workspaces()')).rejects.toThrow(/42501|bestätigte|WORKSPACE_ADMIN_FORBIDDEN/);
  await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/42501|bestätigte|WORKSPACE_ADMIN_FORBIDDEN/);
  await login('','anon');await expect(attempt('select public.list_owned_workspaces()')).rejects.toThrow(/permission denied/);await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/permission denied/);
 });
 it('allows a transferred owner to delete an archived workspace created by someone else',async()=>{
  const w=await create();await db.query("select public.invite_member($1,'other@example.org','manager')",[w.id]);await login(other);await db.exec('select public.accept_invitations()');await login();await db.query("select public.set_member_role($1,$2,'owner')",[w.id,other]);await db.query('select public.demo_archive_workspace($1)',[w.id]);await login(other);expect((await list())[0].id).toBe(w.id);await remove(w);
 });
 it('cannot forge a deletion capability or bypass ordinary immutable-row guards',async()=>{
  const w=await create();await db.query("select set_config('vave.delete_workspace',$1,true)",[w.id]);
  await expect(attempt('insert into private.workspace_delete_context(workspace_id,actor,transaction_id)values($1,$2,txid_current())',[w.id,owner])).rejects.toThrow(/permission denied/);
  await expect(attempt('select private.workspace_delete_allowed($1)',[w.id])).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
  await expect(attempt('delete from public.finance_invoices where workspace_id=$1',[w.id])).rejects.toThrow(/FINANCE_CONFLICT/);
  await expect(attempt("delete from public.time_entries where workspace_id=$1 and status='approved'",[w.id])).rejects.toThrow(/Entwürfe/);
  await expect(attempt("delete from public.memberships where workspace_id=$1 and role='owner'",[w.id])).rejects.toThrow(/letzte Owner/);
  await login();await remove(w);await db.exec('reset role');expect(await rows('select * from private.workspace_delete_context')).toEqual([]);
 });
 it('rolls every earlier deletion and its capability back if any dependency fails',async()=>{
  const w=await create();const before=await snapshot(w.id);
  await db.exec("create function private.reject_fixture_delete() returns trigger language plpgsql as $$begin raise exception 'injected failure';end$$;create trigger reject_fixture_delete before delete on public.projects for each row execute function private.reject_fixture_delete()");
  await login();await expect(attempt('select public.delete_workspace($1,$2,true)',[w.id,w.name])).rejects.toThrow(/injected failure/);expect(await snapshot(w.id)).toEqual(before);
 });
 it('deletes a real workspace with approved claimed time, immutable invoices/cancellation, timer receipts and pending invitations',async()=>{
  const w=await one<{id:string;name:string}>("select * from public.create_workspace('Real studio','UTC','EUR')");
  const p=await one<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'REAL','Real work')returning id",[w.id]);
  const client=await one<{id:string}>("insert into public.finance_clients(workspace_id,name,billing_address)values($1,'Customer','Customer address')returning id",[w.id]);
  await db.query("insert into public.finance_billing_profiles(workspace_id,legal_name,billing_address,tax_id)values($1,'Issuer','Issuer address','TEST')",[w.id]);
  await db.query("insert into public.finance_staff_rates(workspace_id,user_id,effective_from,bill_rate_minor)values($1,$2,'2026-01-01',10000)",[w.id,owner]);
  const timer=await one<{id:string}>("select * from public.start_timer($1,$2,'Completed timer',true)",[w.id,p.id]);
  await db.exec('reset role');await db.query("update public.running_timers set started_at=clock_timestamp()-interval '2 minutes' where id=$1",[timer.id]);await login();
  const entry=await one<{id:string;work_date:string}>('select * from public.stop_timer($1)',[timer.id]);
  await db.query('select public.submit_entries($1,$2::date,$2::date)',[w.id,entry.work_date]);await db.query('select public.review_entry($1,true)',[entry.id]);
  const draft=(await one<{v:{id:string}}>('select public.finance_draft_from_time($1::jsonb)v',[JSON.stringify({workspace_id:w.id,client_id:client.id,project_id:p.id,language:'en',from:entry.work_date,to:entry.work_date,issue_date:entry.work_date,due_date:entry.work_date,tax_basis_points:1900,zero_tax_reason:''})])).v;
  await db.query('select public.finance_issue_invoice($1,$2)',[w.id,draft.id]);await db.query("select public.finance_cancel_invoice($1,$2,'Fixture correction')",[w.id,draft.id]);
  await db.query("select public.invite_member($1,'pending@example.org','member')",[w.id]);
  expect((await list())[0]).toMatchObject({is_demo:false,counts:{invoices:2,time_entries:1}});await remove(w);
  expect(Object.values(await snapshot(w.id)).every(v=>v.length===0)).toBe(true);expect(await rows('select id from auth.users')).toHaveLength(2);
 });
 it('does not retain a capability after successful deletion that could affect another workspace',async()=>{
  const w=await create(),keep=await create('Retain ordinary protections');await remove(w);await db.exec('reset role');
  await expect(attempt('delete from public.finance_invoices where workspace_id=$1',[keep.id])).rejects.toThrow(/FINANCE_CONFLICT/);
  await expect(attempt("delete from public.time_entries where workspace_id=$1 and status='approved'",[keep.id])).rejects.toThrow(/Entwürfe/);
 });
 it('preserves ordinary browser owner/member draft creation, edits and deletion without private helper privileges',async()=>{
  const w=await one<{id:string}>("select * from public.create_workspace('Ordinary drafts','UTC','EUR')");
  const p=await one<{id:string}>("insert into public.projects(workspace_id,code,name)values($1,'DRAFT','Draft project')returning id",[w.id]);
  await db.query("select public.invite_member($1,'other@example.org','member')",[w.id]);await login(other);await db.exec('select public.accept_invitations()');
  for(const actor of [owner,other]) {
   await login(actor);
   const e=await one<{id:string}>("insert into public.time_entries(workspace_id,project_id,work_date,minutes)values($1,$2,'2026-10-14',30)returning id",[w.id,p.id]);
   expect(await rows('update public.time_entries set minutes=45 where id=$1 returning minutes',[e.id])).toEqual([{minutes:45}]);
   expect(await rows('delete from public.time_entries where id=$1 returning id',[e.id])).toEqual([{id:e.id}]);
  }
 });
 it('executes the exact live smoke fixture and rolls back all synthetic accounts and data',async()=>{
  await db.exec('rollback');await db.exec('reset role');
  const before=await rows('select id from auth.users order by id');
  const result=await db.exec(readFileSync('tests/live/workspace-admin-smoke.sql','utf8'));
  expect(result.some(r=>r.rows.some(row=>(row as Record<string,unknown>).deleted_fixture_workspaces===2))).toBe(true);
  expect(await rows('select id from auth.users order by id')).toEqual(before);
  expect(await rows('select id from public.workspaces')).toEqual([]);
  await db.exec('begin');
 });
});
