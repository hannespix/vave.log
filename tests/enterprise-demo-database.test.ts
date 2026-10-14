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


describe('enterprise demo scale',()=>{
 it('models 100 fictional demo employees plus 12 freelancers and a profitable multi-million annual portfolio',async()=>{
  const w=await create();
  expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(5);
  expect(await rows(`select r.kind,count(*)::int n from public.memberships m join public.finance_staff_rates r using(workspace_id,user_id) where m.is_demo group by r.kind order by r.kind`)).toEqual([{kind:'employee',n:100},{kind:'freelancer',n:12}]);
  expect(await rows('select * from public.projects')).toHaveLength(25);
  const economics=await one<any>(`select sum(fixed_fee_minor)::bigint fees,sum(planned_expenses_minor)::bigint expenses from public.finance_project_plans where fixed_fee_minor>=100000000`);
  expect(Number(economics.fees)).toBeGreaterThanOrEqual(1800000000);expect(Number(economics.fees)).toBeLessThanOrEqual(2500000000);
  const plans=await rows<any>(`select p.*, (select sum((l->>'planned_minutes')::numeric/60*(l->>'cost_rate_minor')::numeric) from jsonb_array_elements(p.lines) l) labor from public.finance_project_plans p where fixed_fee_minor>=100000000`);
  expect(plans).toHaveLength(12);
  let hours=0;
  for(const p of plans){const margin=(Number(p.fixed_fee_minor)-Number(p.labor)-Number(p.planned_expenses_minor))/Number(p.fixed_fee_minor);expect(margin).toBeGreaterThanOrEqual(.2);expect(margin).toBeLessThanOrEqual(.35);for(const l of p.lines){hours+=l.planned_minutes/60;expect(l.cost_rate_minor).toBeGreaterThanOrEqual(6000);expect(l.cost_rate_minor).toBeLessThanOrEqual(9000);expect(l.bill_rate_minor).toBeGreaterThanOrEqual(15000);expect(l.bill_rate_minor).toBeLessThanOrEqual(21000)}}
  expect(hours).toBeGreaterThanOrEqual(120000);expect(hours).toBeLessThanOrEqual(140000);
  expect(await one(`select count(*)::int n from public.time_entries e join public.finance_project_plans p using(workspace_id,project_id) where p.fixed_fee_minor>=100000000 and not exists(select 1 from jsonb_array_elements(p.lines) l where l->>'user_id'=e.user_id::text)`)).toEqual({n:0});
  expect(await rows(`select l->>'user_id' from public.finance_project_plans p cross join lateral jsonb_array_elements(p.lines) l where p.fixed_fee_minor>=100000000 group by l->>'user_id' having sum((l->>'planned_minutes')::int)>1600*60`)).toEqual([]);

  const actual=await one<any>('select sum(minutes)::int minutes,count(*)::int n from public.time_entries');
  expect(actual.minutes/60).toBeGreaterThan(24000);expect(actual.minutes/60).toBeLessThan(28000);expect(actual.n).toBeGreaterThan(3000);
  expect(await rows('select user_id,work_date from public.time_entries group by user_id,work_date having sum(minutes)>480')).toEqual([]);
  expect(await rows("select * from public.time_entries where work_date>(now() at time zone 'Europe/Berlin')::date")).toEqual([]);
  const invoices=(await one<{v:any[]}>('select public.finance_list_invoices($1) v',[w.id])).v;
  expect(invoices.filter(x=>x.status==='issued'&&!x.cancellation_id).reduce((sum,x)=>sum+x.net_minor,0)).toBeGreaterThan(500000000);
  const month=new Date().toISOString().slice(0,7),currentIssued=invoices.filter(x=>x.status==='issued'&&!x.cancellation_id&&x.issue_date.startsWith(month));
  expect(currentIssued.filter(x=>x.paid).reduce((sum,x)=>sum+x.net_minor,0)).toBeGreaterThan(100000000);
  expect(currentIssued.filter(x=>!x.paid).reduce((sum,x)=>sum+x.net_minor,0)).toBeGreaterThan(100000000);
  expect(invoices.some(x=>x.status==='draft'&&x.net_minor>10000000)).toBe(true);
  expect(invoices.some(x=>x.status==='issued'&&x.paid&&x.net_minor>10000000)).toBe(true);
  expect(invoices.some(x=>x.status==='issued'&&!x.paid&&!x.cancellation_id&&x.due_date<new Date().toISOString().slice(0,10)&&x.net_minor>10000000)).toBe(true);
  expect(invoices.every(x=>x.is_demo&&(!x.number||x.number.startsWith('DEMO-'))&&x.payment_instructions.includes('DO NOT PAY'))).toBe(true);
  expect((await one<any>('select manifest from public.workspace_demos')).manifest).toEqual(DEMO_MANIFEST);
  await db.exec('reset role');expect(await rows('select * from auth.users')).toHaveLength(4);expect(await rows('select * from private.demo_seed_context')).toEqual([]);
 });
 it('upgrades v2 additively, preserves all edited records and issued snapshots, and retries do nothing',async()=>{
  await db.exec('reset role');
  const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Previous demo','UTC','en',$1)",[requestId]);
  await db.query('select private.demo_upgrade_workspace_v2($1)',[w.id]);await login(owner);
  expect((await one<any>('select experience_version from public.workspace_demos')).experience_version).toBe(2);
  await db.query("update public.projects set name='Retained personal project',budget_minutes=777 where workspace_id=$1",[w.id]);
  await db.query("update public.finance_project_plans set fixed_fee_minor=1234567 where workspace_id=$1",[w.id]);
  await db.query("update public.finance_staff_rates set cost_rate_minor=1234 where workspace_id=$1",[w.id]);
  await db.query("update public.finance_clients set contact_email='edited@example.invalid' where workspace_id=$1",[w.id]);
  await db.query("update public.finance_billing_profiles set legal_name='Custom company' where workspace_id=$1",[w.id]);
  const tables=['memberships','projects','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_staff_rates','finance_billing_profiles','finance_invoices','finance_payments'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(`select * from public.${table} where workspace_id=$1 order by to_jsonb(${table})::text`,[w.id])])));
  const before=await snapshot();await create();expect(await snapshot()).toEqual(before);
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);
  const upgraded=await snapshot();for(const table of tables)for(const row of before[table]!)expect(upgraded[table]).toContainEqual(row);
  expect(upgraded.memberships).toHaveLength(113);expect(upgraded.projects).toHaveLength(25);
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);await create();expect(await snapshot()).toEqual(upgraded);
  await db.exec('reset role');expect(await rows('select * from private.demo_seed_context')).toEqual([]);
 });
 it('rolls v2 back unchanged when enterprise invoice creation fails, then retries safely',async()=>{
  await db.exec('reset role');const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Previous demo','UTC','en',$1)",[requestId]);
  await db.query('select private.demo_upgrade_workspace_v2($1)',[w.id]);
  await db.exec("create function private.test_fail_enterprise() returns trigger language plpgsql as $$begin if new.net_minor>=10000000 then raise exception 'injected enterprise failure';end if;return new;end$$;create trigger test_fail_enterprise before insert on public.finance_invoices for each row execute function private.test_fail_enterprise()");
  await login(owner);await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/injected enterprise failure/);
  expect((await one<any>('select experience_version from public.workspace_demos')).experience_version).toBe(2);expect(await rows('select * from public.projects')).toHaveLength(13);expect(await rows('select * from public.memberships')).toHaveLength(58);
  await db.exec('reset role');expect(await rows('select * from private.demo_seed_context')).toEqual([]);await db.exec('drop trigger test_fail_enterprise on public.finance_invoices');await login(owner);
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);expect((await one<any>('select experience_version from public.workspace_demos')).experience_version).toBe(5);
 });
});
