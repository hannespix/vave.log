import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_MANIFEST } from '../src/shared/demo-data.js';

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

describe('researched demo workspaces',()=>{
  it('creates a complete owned EUR workspace with exact provenance and fictional operations',async()=>{
    await expect(create()).resolves.toMatchObject({name:'VAVE demo',currency:'EUR',created_by:owner,timezone:'Europe/Berlin'});
    const w=await one<{id:string}>('select id from public.workspaces');
    expect(await rows('select role,user_id from public.memberships where not is_demo')).toEqual([{role:'owner',user_id:owner}]);
    for(const [table,count] of [['projects',25],['tasks',102],['finance_clients',25],['finance_project_plans',25],['finance_expenses',64],['finance_staff_rates',113],['time_entries',3713],['finance_invoices',45]] as const)
      expect(await rows(`select * from public.${table} where workspace_id=$1`,[w.id])).toHaveLength(count);
    expect(await rows('select * from public.invitations')).toEqual([]);
    const d=await one<{manifest:any;manifest_version:string;locale:string;archived_at:null;experience_version:number}>('select * from public.workspace_demos where workspace_id=$1',[w.id]);
    expect(d.manifest.version).toBe(d.manifest_version);expect(d.manifest).toEqual(DEMO_MANIFEST);
    expect(d.manifest.projects).toHaveLength(8);expect(d.manifest.people).toHaveLength(112);expect(d.manifest.studios).toHaveLength(8);
    expect(d.manifest.disclosure.en).toMatch(/fictional/i);expect(d.experience_version).toBe(5);
    expect(d.manifest.projects.every((p:any)=>p.source_url.startsWith('https://www.vave.studio/project/'))).toBe(true);
    expect(d.archived_at).toBeNull();expect(d.locale).toBe('en');
    expect(await rows("select * from public.finance_clients where contact_email<>'' and contact_email not like '%@example.invalid'")).toEqual([]);
    expect((await one('select legal_name from public.finance_billing_profiles')).legal_name).toMatch(/fictional/);
    await db.exec('reset role');expect(await rows('select * from auth.users')).toHaveLength(4);
  });

  it('returns the original workspace on retry without duplicating or overwriting sample records',async()=>{
    const first=await create(),retry=await create('de',requestId,'Changed name','UTC');
    expect(retry).toEqual(first);
    expect(await rows('select * from public.workspaces')).toHaveLength(1);
    expect(await rows('select * from public.projects')).toHaveLength(25);
    expect(await rows('select * from public.time_entries')).toHaveLength(3713);
    expect(await rows('select * from public.finance_invoices')).toHaveLength(45);
  });

  it.each(['de','zh'])('uses %s labels while preserving original public project names',async(locale)=>{
    const w=await create(locale);
    const metadata=await one<{manifest:any;locale:string}>('select * from public.workspace_demos where workspace_id=$1',[w.id]);
    expect(metadata.locale).toBe(locale);
    expect((await rows<{title:string}>('select distinct title from public.tasks')).map(x=>x.title).sort()).toEqual(expect.arrayContaining(metadata.manifest.phases.map((x:any)=>x[locale])));
    expect(await rows("select * from public.projects where name='MY MUSEUM'")).toHaveLength(1);
    expect((await one('select language from public.finance_invoices')).language).toBe(locale);
  });

  it('keeps another creator using the same request ID isolated',async()=>{
    const first=await create(); await login(other); const second=await create();
    expect(second.id).not.toBe(first.id);
    expect(await rows('select workspace_id from public.workspace_demos')).toEqual([{workspace_id:second.id}]);
    expect(await rows('select id from public.workspaces')).toEqual([{id:second.id}]);
    expect(await rows('select * from public.finance_clients where workspace_id=$1',[first.id])).toEqual([]);
  });

  it('requires a verified account and rejects invalid input without partial records',async()=>{
    await login(unverified);
    await expect(attempt("select public.demo_create_workspace('Demo','UTC','en',$1)",[requestId])).rejects.toThrow(/bestätig|DEMO_FORBIDDEN/);
    await login(owner);
    for(const args of [['Demo','Mars/City','en',requestId],['Demo','UTC','fr',requestId],['','UTC','en',requestId],['Demo','UTC','en',null]]) await expect(attempt('select public.demo_create_workspace($1,$2,$3,$4)',args)).rejects.toThrow();
    expect(await rows('select * from public.workspaces')).toEqual([]);
    await login('','anon');
    await expect(attempt("select public.demo_create_workspace('Demo','UTC','en',$1)",[requestId])).rejects.toThrow(/permission denied/);
  });

  it('rolls back the entire new workspace when invoice draft creation fails',async()=>{
    await db.exec('reset role');
    await db.exec("create function private.test_fail_demo_invoice() returns trigger language plpgsql as $$begin raise exception 'injected draft failure'; end$$; create trigger test_fail_demo_invoice before insert on public.finance_invoices for each row execute function private.test_fail_demo_invoice()");
    await login(owner);
    await expect(attempt("select public.demo_create_workspace('Demo','UTC','en',$1)",[requestId])).rejects.toThrow(/injected draft failure/);
    await db.exec('reset role');
    for(const table of ['workspaces','workspace_demos','memberships','projects','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','audit_log']) expect(await rows(`select * from public.${table}`)).toEqual([]);
  });

  it('allows members to read provenance but forbids direct writes and financial reads',async()=>{
    const w=await create(); await addMember(w.id); await login(member);
    expect(await rows('select * from public.workspace_demos where workspace_id=$1',[w.id])).toHaveLength(1);
    expect(await rows('select * from public.finance_project_plans')).toEqual([]);
    for(const sql of ["update public.workspace_demos set archived_at=now() where workspace_id=$1","delete from public.workspace_demos where workspace_id=$1","insert into public.workspace_demos(workspace_id,created_by,request_id,locale,manifest_version,manifest) values($1,auth.uid(),gen_random_uuid(),'en','fake','{}')"]) await expect(attempt(sql,[w.id])).rejects.toThrow(/permission denied/);
    await login(other); expect(await rows('select * from public.workspace_demos')).toEqual([]);
  });

  it('issues demo documents while ignoring a user-selected real invoice prefix',async()=>{
    const w=await create();
    const invoice=await one<{id:string}>("select id from public.finance_invoices where status='draft' limit 1");
    await db.query("update public.finance_billing_profiles set invoice_prefix='INV' where workspace_id=$1",[w.id]);
    const issued=(await one<{v:{number:string;is_demo:boolean}}>('select public.finance_issue_invoice($1,$2) v',[w.id,invoice.id])).v;
    expect(issued.number).toMatch(/^DEMO-/);expect(issued.is_demo).toBe(true);
  });

  it('archives only demos created by the current, still active owner and can be retried',async()=>{
    const w=await create(); await addMember(w.id,'manager');
    await login(member); await expect(attempt('select public.demo_archive_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
    await login(owner); await db.query("select public.set_member_role($1,$2,'owner')",[w.id,member]);
    await login(member); await expect(attempt('select public.demo_archive_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
    for(const role of ['member','disabled']) {
      await db.query('select public.set_member_role($1,$2,$3)',[w.id,owner,role]);
      await login(owner); await expect(attempt('select public.demo_archive_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
      await login(member);
    }
    await login(member); await db.query("select public.set_member_role($1,$2,'owner')",[w.id,owner]);
    await login(owner); await db.query('select public.demo_archive_workspace($1)',[w.id]);
    await db.query('select public.demo_archive_workspace($1)',[w.id]);
    expect(await rows('select * from public.workspaces')).toEqual([]);
    await expect(attempt("select public.demo_create_workspace('Demo','UTC','en',$1)",[requestId])).rejects.toThrow(/DEMO_CONFLICT/);
  });

  it('cannot archive a real workspace or another creator workspace',async()=>{
    const real=await one<{id:string}>("select * from public.create_workspace('Real','UTC','EUR')");
    await expect(attempt('select public.demo_archive_workspace($1)',[real.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
    const demo=await create(); await login(other);
    await expect(attempt('select public.demo_archive_workspace($1)',[demo.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  });

  it('hides archived data through existing RLS while retaining entries, invoices and the last owner',async()=>{
    const w=await create();
    await db.query("select public.submit_entries($1,date_trunc('week',now() at time zone 'Europe/Berlin')::date,date_trunc('week',now() at time zone 'Europe/Berlin')::date+6)",[w.id]);
    const entry=await one<{id:string}>("select id from public.time_entries where status='submitted' and user_id=$1 limit 1",[owner]);
    await db.query('select public.review_entry($1,true)',[entry.id]);
    await db.query('select public.demo_archive_workspace($1)',[w.id]);
    expect((await one('select private.current_role($1) role',[w.id])).role).toBeNull();
    for(const table of ['workspaces','workspace_demos','memberships','projects','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_invoices','audit_log']) expect(await rows(`select * from public.${table}`)).toEqual([]);
    await expect(attempt("insert into public.projects(workspace_id,code,name) values($1,'BAD','Hidden write')",[w.id])).rejects.toThrow();
    await expect(attempt('select public.finance_list_invoices($1)',[w.id])).rejects.toThrow(/FINANCE_FORBIDDEN/);
    await db.exec('reset role');
    expect(await rows('select * from public.time_entries where workspace_id=$1',[w.id])).toHaveLength(3713);
    expect(await rows("select * from public.time_entries where id=$1 and status='approved'",[entry.id])).toHaveLength(1);
    expect(await rows('select * from public.finance_invoices where workspace_id=$1',[w.id])).toHaveLength(45);
    expect(await rows("select * from public.memberships where workspace_id=$1 and role='owner'",[w.id])).toHaveLength(1);
    expect((await one('select archived_at from public.workspace_demos where workspace_id=$1',[w.id])).archived_at).not.toBeNull();
  });

  it('requires running timers to be stopped or discarded before archiving',async()=>{
    const w=await create(),p=await one<{id:string}>('select id from public.projects limit 1');
    const timer=await one<{id:string}>('select * from public.start_timer($1,$2,$3,true)',[w.id,p.id,'Demo timer']);
    await expect(attempt('select public.demo_archive_workspace($1)',[w.id])).rejects.toThrow(/DEMO_CONFLICT.*timer/i);
    expect(await rows('select * from public.running_timers')).toHaveLength(1);
    await db.query('select public.discard_timer($1)',[timer.id]);
    await db.query('select public.demo_archive_workspace($1)',[w.id]);
    expect(await rows('select * from public.workspaces')).toEqual([]);
  });
});
