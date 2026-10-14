import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// These tests exercise the actual PostgreSQL privileges, RLS, RPCs and triggers.
// Removing atomic seed ownership, archive authorization, or the issue hook makes
// the matching behavior below fail; only Supabase's identity provider is stubbed.
const owner='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
const other='00000000-0000-4000-8000-000000000003';
const unverified='00000000-0000-4000-8000-000000000004';
const requestId='10000000-0000-4000-8000-000000000001';
let db:PGlite;
const rows=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id:string,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec(`set role ${role}`);
}
async function attempt(sql:string,args:unknown[]=[]) {
  await db.exec('savepoint expected_failure');
  try { const result=await rows(sql,args); await db.exec('release savepoint expected_failure'); return result; }
  catch(error) { await db.exec('rollback to savepoint expected_failure'); await db.exec('release savepoint expected_failure'); throw error; }
}
const create=(locale='en',request=requestId,name='VAVE demo',timezone='Europe/Berlin') => one<{id:string;name:string;currency:string;created_by:string;timezone:string}>('select * from public.demo_create_workspace($1,$2,$3,$4)',[name,timezone,locale,request]);
async function addMember(workspace:string,role='member') {
  await db.query('select public.invite_member($1,$2,$3)',[workspace,'member@example.org',role]);
  await login(member); await db.exec('select public.accept_invitations()'); await login(owner);
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.org',now()),($2,'member@example.org',now()),($3,'other@example.org',now()),($4,'pending@example.org',null)",[owner,member,other,unverified]);
},60000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{await db.exec('begin');await login(owner)});
afterEach(async()=>{await db.exec('rollback')});

describe('complete demo security and scenarios',()=>{
 it('creates every persona as an isolated non-login identity and fills the actual work tables',async()=>{
  const w=await create();
  expect(await one('select experience_version from public.workspace_demos')).toEqual({experience_version:5});
  expect(await rows('select * from public.memberships where is_demo')).toHaveLength(112);
  expect(await rows("select * from public.memberships where is_demo and (role='owner' or auth_user_id is not null or email not like '%@example.invalid')")).toEqual([]);
  expect(await rows('select * from public.projects')).toHaveLength(25);
  expect(await rows('select distinct status from public.projects')).toHaveLength(3);
  expect(await rows('select distinct status from public.tasks')).toHaveLength(3);
  expect(await rows('select distinct billing_mode from public.finance_project_plans')).toHaveLength(3);
  expect(await rows('select * from public.finance_staff_rates')).toHaveLength(113);
  expect(await rows('select distinct status from public.time_entries where user_id=$1',[owner])).toHaveLength(3);
  expect(await rows('select * from public.running_timers')).toEqual([]);
  expect(await rows('select * from public.invitations')).toEqual([]);
  expect((await one<{n:number}>('select count(*)::int n from public.time_entries')).n).toBeGreaterThan(3000);
  expect((await one<{n:number}>('select count(*)::int n from public.time_entries')).n).toBeLessThan(4000);
  expect(await rows('select * from public.tasks where assignee_id=$1',[owner])).not.toHaveLength(0);
  const invoices=(await one<{v:any[]}>('select public.finance_list_invoices($1) v',[w.id])).v;
  expect(invoices.some(x=>x.status==='draft')).toBe(true);
  expect(invoices.some(x=>x.paid)).toBe(true);
  expect(invoices.some(x=>x.status==='issued'&&!x.paid&&new Date(x.due_date)<new Date())).toBe(true);
  expect(invoices.some(x=>x.status==='cancellation')).toBe(true);
  expect(invoices.every(x=>x.is_demo&&(!x.number||x.number.startsWith('DEMO-')))).toBe(true);
  await db.exec('reset role');expect(await rows('select * from auth.users')).toHaveLength(4);
 });
 it('retains real-account FK guarantees while rejecting sample identity promotion or movement',async()=>{
  const w=await create(); const person=await one<{user_id:string}>('select user_id from public.memberships where is_demo limit 1');
  await expect(attempt("select public.set_member_role($1,$2,'owner')",[w.id,person.user_id])).rejects.toThrow(/DEMO|check constraint/);
  const real=await one<{id:string}>("select * from public.create_workspace('Real','UTC','EUR')");
  await db.exec('reset role');
  await expect(attempt("insert into public.memberships(workspace_id,user_id,role,display_name,email) values($1,gen_random_uuid(),'member','Fake','fake@example.invalid')",[real.id])).rejects.toThrow(/foreign key/);
  await expect(attempt("insert into public.memberships(workspace_id,user_id,role,display_name,email,is_demo,demo_origin) values($1,gen_random_uuid(),'member','Demo','demo@example.invalid',true,'fictional')",[real.id])).rejects.toThrow(/DEMO/);
  await expect(attempt('update public.memberships set is_demo=false where user_id=$1',[person.user_id])).rejects.toThrow(/DEMO/);
  await expect(attempt('update public.memberships set workspace_id=$1 where user_id=$2',[real.id,person.user_id])).rejects.toThrow();
  await expect(attempt("insert into public.tasks(workspace_id,project_id,title,assignee_id,created_by) select $1,id,'Cross tenant',$2,$3 from public.projects where workspace_id=$4 limit 1",[real.id,person.user_id,owner,w.id])).rejects.toThrow(/foreign key/);
 });
 it('never authenticates a demo membership even if a matching auth identity appears',async()=>{
  const w=await create(),person=await one<{user_id:string}>('select user_id from public.memberships where is_demo limit 1');
  await db.exec('reset role');await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'collision@example.org',now())",[person.user_id]);
  await login(person.user_id);
  expect((await one('select private.current_role($1) role',[w.id])).role).toBeNull();
  expect(await rows('select * from public.workspaces')).toEqual([]);
  await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
 });
 it('permits ordinary demo issuance and cancellation with irrevocable no-payment markings',async()=>{
  const w=await create(); const draft=await one<{id:string}>("select id from public.finance_invoices where status='draft' limit 1");
  await db.query("update public.finance_billing_profiles set invoice_prefix='REAL',payment_details='Account 123' where workspace_id=$1",[w.id]);
  const issued=(await one<{v:any}>('select public.finance_issue_invoice($1,$2)v',[w.id,draft.id])).v;
  expect(issued.is_demo).toBe(true);expect(issued.number).toMatch(/^DEMO-/);
  expect(issued.payment_instructions).toMatch(/DEMO.*DO NOT PAY/);
  expect(issued.issuer_snapshot.payment_details).toMatch(/DEMO.*DO NOT PAY/);
  expect(issued.issuer_snapshot.is_demo).toBe(true);expect(issued.customer_snapshot.is_demo).toBe(true);
  expect((await one<{v:any}>('select public.finance_issue_invoice($1,$2)v',[w.id,draft.id])).v.number).toBe(issued.number);
  const cancelled=(await one<{v:any}>("select public.finance_cancel_invoice($1,$2,'Demo correction')v",[w.id,draft.id])).v;
  expect(cancelled.is_demo).toBe(true);expect(cancelled.number).toMatch(/^DEMO-/);expect(cancelled.total_minor).toBe(-issued.total_minor);
  await db.exec('reset role');
  await expect(attempt('update public.finance_invoices set is_demo=false where id=$1',[draft.id])).rejects.toThrow(/FINANCE_CONFLICT|DEMO/);
 });
 it('rejects caller-controlled sample flags and keeps seeding internals inaccessible',async()=>{
  const w=await create();const d=await one<any>("select * from public.finance_invoices where status='draft' limit 1");
  const input={workspace_id:w.id,client_id:d.client_id,project_id:d.project_id,language:'en',issue_date:d.issue_date,due_date:d.due_date,service_from:d.service_from,service_to:d.service_to,lines:[],is_demo:false};
  await expect(attempt('select public.finance_save_draft($1::jsonb)',[JSON.stringify(input)])).rejects.toThrow(/FINANCE_VALIDATION/);
  await expect(attempt("select private.demo_create_workspace_base('Hidden','UTC','en',gen_random_uuid())")).rejects.toThrow(/permission denied/);
  await expect(attempt('select * from private.demo_seed_context')).rejects.toThrow(/permission denied/);
 });
 it('upgrades only creator-owned demos and retries preserve every edited record',async()=>{
  const real=await one<{id:string}>("select * from public.create_workspace('Real','UTC','EUR')");
  await expect(attempt('select public.demo_upgrade_workspace($1)',[real.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  const w=await create();await addMember(w.id,'manager');await login(member);
  await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  await login(owner);await db.query("update public.projects set name='My edited project' where workspace_id=$1",[w.id]);
  const before=await rows('select * from public.time_entries order by id');
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);await create();
  expect(await rows('select * from public.time_entries order by id')).toEqual(before);
  expect(await rows("select * from public.projects where name<>'My edited project' and workspace_id=$1",[w.id])).toEqual([]);
 });
 it('keeps all booked sample time in the present or past',async()=>{
  const w=await create();
  expect(await rows("select * from public.time_entries where workspace_id=$1 and work_date>(now() at time zone 'Europe/Berlin')::date",[w.id])).toEqual([]);
 });
 it('enriches legacy demos once without modifying existing user data or partially configured company details',async()=>{
  await db.exec('reset role');
  const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Legacy demo','UTC','en',$1)",[requestId]);
  await login(owner);
  await db.query("update public.projects set name='My custom project',budget_minutes=777 where workspace_id=$1",[w.id]);
  await db.query("update public.finance_billing_profiles set legal_name='My custom company' where workspace_id=$1",[w.id]);
  await db.query("update public.finance_clients set contact_email='kept@example.invalid' where workspace_id=$1",[w.id]);
  const tables=['projects','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_billing_profiles','finance_invoices'];
  const before:Record<string,Record<string,unknown>[]>=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(`select * from public.${table} where workspace_id=$1`,[w.id])])));
  await create();expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(1);
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);
  for(const table of tables){const after=await rows(`select * from public.${table} where workspace_id=$1`,[w.id]);for(const row of before[table]!)expect(after).toContainEqual(row)}
  expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(5);
  expect(await rows("select * from public.finance_invoices where status='issued'")).toHaveLength(29);
  const counts=await one('select (select count(*) from public.memberships)::int people,(select count(*) from public.time_entries)::int entries');
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);
  expect(await one('select (select count(*) from public.memberships)::int people,(select count(*) from public.time_entries)::int entries')).toEqual(counts);
 });
 it('rolls back all enrichment on failure and permits a clean retry',async()=>{
  await db.exec('reset role');
  const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Legacy demo','UTC','en',$1)",[requestId]);
  await db.exec("create function private.test_fail_enrichment() returns trigger language plpgsql as $$begin if new.is_demo then raise exception 'injected enrichment failure'; end if;return new;end$$;create trigger test_fail_enrichment before insert on public.memberships for each row execute function private.test_fail_enrichment()");
  await login(owner);await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/injected enrichment failure/);
  expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(1);
  expect(await rows('select * from public.memberships')).toHaveLength(1);
  await db.exec('reset role');expect(await rows('select * from private.demo_seed_context')).toEqual([]);await db.exec('drop trigger test_fail_enrichment on public.memberships');
  await login(owner);await db.query('select public.demo_upgrade_workspace($1)',[w.id]);
  expect(await rows('select * from public.memberships')).toHaveLength(113);
 });
 it('keeps sample time review, invoice claims and cross-workspace membership links protected',async()=>{
  const w=await create();const e=await one<{id:string;project_id:string;user_id:string}>("select id,project_id,user_id from public.time_entries where status='submitted' and billable and user_id<>$1 limit 1",[owner]);
  const approved=await one<any>('select * from public.review_entry($1,true)',[e.id]);expect(approved.status).toBe('approved');
  const c=await one<{id:string}>('select id from public.finance_clients limit 1');
  const line={description:'Fictional service',quantity:1,unit_price_minor:1,tax_basis_points:1900,zero_tax_reason:'',time_entry_id:e.id};
  const input={workspace_id:w.id,client_id:c.id,project_id:e.project_id,language:'en',issue_date:'2026-10-14',due_date:'2026-11-14',service_from:'2026-01-01',service_to:'2026-12-31',lines:[line]};
  const d=(await one<{v:any}>('select public.finance_save_draft($1::jsonb)v',[JSON.stringify(input)])).v;
  await db.query('select public.finance_issue_invoice($1,$2)',[w.id,d.id]);
  expect(await rows('select * from public.finance_time_claims where time_entry_id=$1',[e.id])).toHaveLength(1);
  await expect(attempt('select public.finance_save_draft($1::jsonb)',[JSON.stringify(input)])).rejects.toThrow(/FINANCE_CONFLICT/);
  await expect(attempt("insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,status) values($1,$2,$3,current_date,10,'approved')",[w.id,e.project_id,e.user_id])).rejects.toThrow();
  const real=await one<{id:string}>("select * from public.create_workspace('Real','UTC','EUR')");
  const p=await one<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'R','Real') returning id",[real.id]);
  await expect(attempt("insert into public.tasks(workspace_id,project_id,title,assignee_id) values($1,$2,'Cross tenant person',$3)",[real.id,p.id,e.user_id])).rejects.toThrow(/foreign key/);
 });

});
