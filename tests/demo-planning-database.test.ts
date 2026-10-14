import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectInsight } from '../src/shared/project-insight-types.js';

// These run the migration, authenticated RPCs and timestamp trigger in Postgres.
// Dropping seed provenance, the null-only update or creator checks breaks behavior.
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const request='10000000-0000-4000-8000-000000000001';
let db:PGlite;
const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
const planning=files.find(f=>f.endsWith('_demo_project_planning.sql'));
const rows=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,unknown>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec(`set role ${role}`);
}
async function install() {
  await db.exec('reset role');
  if(planning) await db.exec(readFileSync(join('supabase/migrations',planning),'utf8'));
  await login();
}
async function attempt(sql:string,args:unknown[]=[]) {
  await db.exec('savepoint expected_failure');
  try { const result=await rows(sql,args); await db.exec('release savepoint expected_failure'); return result; }
  catch(error) { await db.exec('rollback to savepoint expected_failure'); await db.exec('release savepoint expected_failure'); throw error; }
}
const create=(timezone='Europe/Berlin',locale='en') => one<{id:string}>('select * from public.demo_create_workspace($1,$2,$3,$4)',['Planning demo',timezone,locale,request]);
const projects=(workspace:string) => rows<any>('select * from public.projects where workspace_id=$1 order by code',[workspace]);
async function insights(workspace:string) {
  const all=await rows<{v:ProjectInsight}>('select public.project_insight($1,id) v from public.projects where workspace_id=$1 order by code',[workspace]);
  return Object.fromEntries(all.map(({v})=>[v.project.code,{insight:v}]));
}
async function business(workspace:string) {
  const tables=['memberships','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_staff_rates','finance_billing_profiles','finance_invoices','finance_payments'];
  return Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(`select * from public.${table} where workspace_id=$1 order by to_jsonb(${table})::text`,[workspace])])));
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for(const f of files.filter(f=>!planning||f<planning)) await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.org',now()),($2,'other@example.org',now())",[owner,other]);
},60000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{await db.exec('begin');await login()});
afterEach(async()=>{await db.exec('rollback')});

describe('demo project outlook planning',()=>{
  it('creates the historical v4 stored planning values and local deadlines',async()=>{
    await install();const w=await create('Pacific/Kiritimati','zh');
    expect(await one('select experience_version from public.workspace_demos')).toEqual({experience_version:4});
    const all=await projects(w.id);expect(all).toHaveLength(25);
    expect(all.every(p=>p.due_date&&p.progress_percent!==null&&p.progress_updated_at)).toBe(true);
    const data=await insights(w.id);
    const enterprise=['NOVA26','CULT26','LEAP27','BLN26','ACC26','SAP27','POR27','RAIL27','HORIZ26','AERO26','HELIX26','TERRA27'];
    for(const code of enterprise) {expect(data[code]!.insight.project.progress_percent).toBeGreaterThan(0);expect(data[code]!.insight.project.progress_percent).toBeLessThan(100)}
    expect(data.LEAP27!.insight.project.due_date!<data.LEAP27!.insight.as_of).toBe(true);
    expect(data.MAT27!.insight.project).toMatchObject({status:'paused',progress_percent:40});
    expect(data.SIGNAL26!.insight.project).toMatchObject({status:'archived',progress_percent:100});
    for(const code of ['MYM26','ICOM25','LEAP25','BAL25','DATA18','META22','POR16','DB23']) expect(data[code]!.insight.project.progress_percent).toBe(95);
    const today=(await one<{today:string}>("select ((now() at time zone 'Pacific/Kiritimati')::date)::text today")).today;
    expect(Object.values(data).every(({insight})=>insight.as_of===today&&insight.progress_date===today)).toBe(true);
    await db.exec('reset role');expect(await rows('select * from auth.users')).toHaveLength(2);
  });

  it('backfills existing v3 demos while retaining independent user planning and every business record',async()=>{
    const w=await create('America/Los_Angeles','de');
    await db.query("update public.projects set due_date='2027-08-16' where workspace_id=$1 and code='NOVA26'",[w.id]);
    await db.query("update public.projects set progress_percent=37.5 where workspace_id=$1 and code='CULT26'",[w.id]);
    await db.query("update public.projects set due_date='2028-04-20',progress_percent=0,budget_minutes=123456 where workspace_id=$1 and code='AERO26'",[w.id]);
    const before=await projects(w.id),values=await business(w.id);
    await install();const after=await projects(w.id);
    expect(await one('select experience_version from public.workspace_demos')).toEqual({experience_version:4});
    expect(await business(w.id)).toEqual(values);
    for(const previous of before) {
      const current=after.find(p=>p.id===previous.id)!;
      for(const key of Object.keys(previous).filter(k=>!['due_date','progress_percent','progress_updated_at'].includes(k))) expect(current[key]).toEqual(previous[key]);
      if(previous.due_date!==null) expect(current.due_date).toEqual(previous.due_date);
      if(previous.progress_percent!==null) expect([current.progress_percent,current.progress_updated_at]).toEqual([previous.progress_percent,previous.progress_updated_at]);
      expect(current.due_date).not.toBeNull();expect(current.progress_percent).not.toBeNull();
    }
    await db.query('select public.demo_upgrade_workspace($1)',[w.id]);await create('America/Los_Angeles','de');
    expect(await projects(w.id)).toEqual(after);expect(await business(w.id)).toEqual(values);
  });

  it('leaves user-added projects and edited identities untouched even when they resemble a seed',async()=>{
    const w=await create();
    await db.query("update public.projects set name='My renamed delivery' where workspace_id=$1 and code='NOVA26'",[w.id]);
    const copy=await one<{id:string}>(`insert into public.projects(workspace_id,code,name,client,budget_minutes)
      select workspace_id,'NOVA26-deadbeef','Life Science Discovery Network — fictional demo',client,budget_minutes from public.projects where workspace_id=$1 and code='NOVA26' returning id`,[w.id]);
    const untouched=await rows('select * from public.projects where workspace_id=$1 and (code=$2 or id=$3)',[w.id,'NOVA26',copy.id]);
    await install();expect(await rows('select * from public.projects where workspace_id=$1 and (code=$2 or id=$3)',[w.id,'NOVA26',copy.id])).toEqual(untouched);
    expect((await projects(w.id)).filter(p=>p.progress_percent!==null)).toHaveLength(24);
  });

  it('never backfills real workspaces or archived demos',async()=>{
    const w=await create();await db.query('select public.demo_archive_workspace($1)',[w.id]);
    const real=await one<{id:string}>("select * from public.create_workspace('Real workspace','UTC','EUR')");
    await db.query("insert into public.projects(workspace_id,code,name,client) values($1,'NOVA26','Life Science Discovery Network — fictional demo','Sinovac Life Sciences')",[real.id]);
    const archived=await projects(w.id),ordinary=await projects(real.id);
    await install();expect(await projects(w.id)).toEqual(archived);expect(await projects(real.id)).toEqual(ordinary);
    await expect(attempt('select public.demo_upgrade_workspace($1)',[real.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
    await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  });

  it.each([1,2])('upgrades v%i through the existing transaction, including collision-safe new projects',async(version)=>{
    await db.exec('reset role');
    const w=await one<{id:string}>("select * from private.demo_create_workspace_base('Old demo','UTC','en',$1)",[request]);
    if(version===2) await db.query('select private.demo_upgrade_workspace_v2($1)',[w.id]);
    await login();
    await db.query("insert into public.projects(workspace_id,code,name,client) values($1,'NOVA26','User project','My client')",[w.id]);
    await db.query("update public.projects set due_date='2028-01-01',progress_percent=12.5 where workspace_id=$1 and code='MYM26'",[w.id]);
    await install();expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(version);
    const custom=(await projects(w.id)).filter(p=>['MYM26','NOVA26'].includes(p.code));
    await db.query('select public.demo_upgrade_workspace($1)',[w.id]);
    expect((await one('select experience_version from public.workspace_demos')).experience_version).toBe(4);
    const after=await projects(w.id);expect(after).toHaveLength(26);
    expect(after.filter(p=>p.progress_percent!==null)).toHaveLength(25);
    for(const p of custom) expect(after).toContainEqual(p);
    expect(after.find(p=>p.code.startsWith('NOVA26-'))!.due_date).not.toBeNull();
    await db.query("update public.projects set due_date=null,progress_percent=null where workspace_id=$1 and code='BLN26'",[w.id]);
    const cleared=await projects(w.id);await db.query('select public.demo_upgrade_workspace($1)',[w.id]);expect(await projects(w.id)).toEqual(cleared);
  });

  it('uses v4 for a new request after an existing creator session has cached the old RPC',async()=>{
    await create();await install();
    const next=await one<{id:string}>("select * from public.demo_create_workspace('Second demo','UTC','en','10000000-0000-4000-8000-000000000002')");
    expect((await projects(next.id)).filter(p=>p.due_date&&p.progress_percent!==null)).toHaveLength(25);
  });

  it('rejects foreign callers and keeps internal planning helpers inaccessible',async()=>{
    await install();const w=await create();const before=await projects(w.id);
    await login(other);await expect(attempt('select public.demo_upgrade_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
    await expect(attempt('select private.demo_seed_project_planning($1)',[w.id])).rejects.toThrow(/permission denied/);
    await expect(attempt('select private.demo_upgrade_workspace_v3($1)',[w.id])).rejects.toThrow(/permission denied/);
    await login();expect(await projects(w.id)).toEqual(before);
  });
});
