import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { forecastProject } from '../src/shared/project-forecast.js';
import type { ProjectInsight } from '../src/shared/project-insight-types.js';

const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let db:PGlite;
const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
const migration=files.find(f=>f.endsWith('_task_progress_milestones.sql'))!;
const rows=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }
async function install() { await db.exec('reset role');await db.exec(readFileSync(join('supabase/migrations',migration),'utf8'));await login(); }
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const result=await rows(sql,args);await db.exec('release savepoint expected_failure');return result}catch(error){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw error}}
const create=() => one<{id:string}>("select * from public.demo_create_workspace('Automatic planning demo','Pacific/Kiritimati','en',gen_random_uuid())");
const tasks=(workspace:string) => rows<any>('select * from public.tasks where workspace_id=$1 order by id',[workspace]);
async function insights(workspace:string) {const all=await rows<{v:ProjectInsight}>('select public.project_insight($1,id) v from public.projects where workspace_id=$1',[workspace]);return Object.fromEntries(all.map(({v})=>[v.project.code,{insight:v,forecast:forecastProject(v)}]));}
async function business(workspace:string) {const names=['projects','memberships','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_staff_rates','finance_billing_profiles','finance_invoices','finance_payments'];return Object.fromEntries(await Promise.all(names.map(async table=>[table,await rows(`select * from public.${table} where workspace_id=$1 order by to_jsonb(${table})::text`,[workspace])])));}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of files.filter(f=>f<migration))await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'other@example.org',now())",[owner,other]);
},60000);
afterAll(async()=>{await db?.close()});beforeEach(async()=>{await db.exec('begin');await login()});afterEach(async()=>{await db.exec('rollback')});

describe('v5 automatic demo progress',()=>{
 it('seeds estimates and milestones with nine healthy enterprise forecasts using the production calculator',async()=>{
  await install();const w=await create();expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(5);
  const all=await tasks(w.id);expect(all).toHaveLength(102);expect(all.every(t=>t.estimated_minutes>0)).toBe(true);expect(all.filter(t=>t.is_milestone)).toHaveLength(33);
  const data=await insights(w.id),codes=['NOVA26','CULT26','LEAP27','BLN26','ACC26','SAP27','POR27','RAIL27','HORIZ26','AERO26','HELIX26','TERRA27'];
  expect(codes.filter(code=>data[code]!.forecast.budgetStatus==='within'&&data[code]!.forecast.deadlineStatus==='within')).toHaveLength(9);
  for(const code of codes){expect(data[code]!.forecast.blockers).toEqual([]);expect(data[code]!.insight.tasks.missing_estimates).toBe(0);expect(data[code]!.insight.milestones?.total).toBe(1)}
  expect(data.CULT26!.forecast).toMatchObject({budgetStatus:'within',deadlineStatus:'late'});
  expect(data.LEAP27!.forecast).toMatchObject({budgetStatus:'within',deadlineStatus:'overdue'});
  expect(data.AERO26!.forecast).toMatchObject({budgetStatus:'over',deadlineStatus:'within'});
  expect(data.TIDE26!.forecast).toMatchObject({budgetStatus:'within',deadlineStatus:'within'});
  expect(data.SIGNAL26!.forecast.progressPercent).toBeLessThan(100);
  await db.exec('reset role');expect(await rows('select * from auth.users')).toHaveLength(2);
 });
 it('changes automatic progress immediately while retaining the stored manual value and timestamp',async()=>{
  await install();const w=await create(),before=(await insights(w.id)).NOVA26!;
  await db.query("update public.tasks set status='done' where workspace_id=$1 and project_id=$2 and is_milestone",[w.id,before.insight.project.id]);
  const after=(await insights(w.id)).NOVA26!;
  expect(after.forecast.progressPercent).toBeGreaterThan(before.forecast.progressPercent!);
  expect(after.insight.milestones).toMatchObject({total:1,done:1,overdue:0});
  expect(after.insight.project.progress_percent).toEqual(before.insight.project.progress_percent);
  expect(after.insight.project.progress_updated_at).toEqual(before.insight.project.progress_updated_at);
  const snapshot=await tasks(w.id);await db.query('select public.demo_upgrade_workspace($1)',[w.id]);expect(await tasks(w.id)).toEqual(snapshot);
 });
 it('backfills existing v4 demos without changing task content or other business records',async()=>{
  const w=await create();const before=await tasks(w.id),records=await business(w.id);
  await install();const after=await tasks(w.id);
  for(const t of before) expect(after.find(x=>x.id===t.id)).toMatchObject(t);
  expect(after.every(t=>t.estimated_minutes>0)).toBe(true);expect(await business(w.id)).toEqual(records);
  expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(5);
  const next=await create();expect((await tasks(next.id)).every(t=>t.estimated_minutes>0)).toBe(true);
 });
 it('preserves supplied estimates, explicit milestone choices, edited tasks and duplicate lookalikes',async()=>{
  await install();await db.exec('reset role');const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Previous demo','UTC','en',gen_random_uuid())");await db.query('select private.demo_upgrade_workspace_v4($1)',[w.id]);await login();
  const chosen=await rows<{id:string}>("select id from public.tasks where workspace_id=$1 and project_id=(select id from public.projects where workspace_id=$1 and code='MYM26') order by id limit 3",[w.id]);
  await db.query('update public.tasks set estimated_minutes=777,is_milestone=false where id=$1',[chosen[0]!.id]);
  await db.query("update public.tasks set status='done',due_date='2028-01-01',is_milestone=true where id=$1",[chosen[1]!.id]);
  await db.query("update public.tasks set title='User edited task' where id=$1",[chosen[2]!.id]);
  const clone=await one<{id:string}>("insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date) select workspace_id,project_id,title,status,assignee_id,due_date from public.tasks where workspace_id=$1 and project_id=(select id from public.projects where workspace_id=$1 and code='NOVA26') and title='Production & Supervision' returning id",[w.id]);
  const protectedIds=[...chosen.map(t=>t.id),clone.id];const before=await rows('select * from public.tasks where id=any($1) order by id',[protectedIds]);
  await db.query('select public.demo_upgrade_workspace($1)',[w.id]);expect(await rows('select * from public.tasks where id=any($1) order by id',[protectedIds])).toEqual(before);
  const sample=(await tasks(w.id)).find(t=>t.estimated_minutes>0&&!protectedIds.includes(t.id))!;
  await db.query('update public.tasks set estimated_minutes=null,is_milestone=false where id=$1',[sample.id]);
  const after=await tasks(w.id);await db.query('select public.demo_upgrade_workspace($1)',[w.id]);expect(await tasks(w.id)).toEqual(after);
 });
 it('leaves real/archived workspaces and foreign callers outside the seed boundary',async()=>{
  const w=await create();await db.query('select public.demo_archive_workspace($1)',[w.id]);
  const real=await one<{id:string}>("select * from public.create_workspace('Real','UTC','EUR')");
  const p=await one<{id:string}>("insert into public.projects(workspace_id,code,name)values($1,'NOVA26','Life Science Discovery Network — fictional demo')returning id",[real.id]);
  await db.query("insert into public.tasks(workspace_id,project_id,title)values($1,$2,'Production & Supervision')",[real.id,p.id]);
  await install();expect((await tasks(w.id)).every(t=>t.estimated_minutes===null&&!t.is_milestone)).toBe(true);expect((await tasks(real.id)).every(t=>t.estimated_minutes===null&&!t.is_milestone)).toBe(true);
  const active=await create();await login(other);await expect(attempt('select public.demo_upgrade_workspace($1)',[active.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  await expect(attempt('select private.demo_seed_task_planning($1)',[active.id])).rejects.toThrow(/permission denied/);
 });
});
