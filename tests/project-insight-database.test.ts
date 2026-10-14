import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { ProjectInsight } from '../src/shared/project-insight-types.js';

const owner='00000000-0000-4000-8000-000000000001',manager='00000000-0000-4000-8000-000000000002',member='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004';
let db:PGlite,workspace:string,project:string,foreignWorkspace:string,foreignProject:string,today:string;
const rows=async<T=Record<string,unknown>>(sql:string,params:unknown[]=[]) =>(await db.query<T>(sql,params)).rows;
const one=async<T=Record<string,unknown>>(sql:string,params:unknown[]=[]) =>(await rows<T>(sql,params))[0]!;
async function login(id:string,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`)}
async function attempt(sql:string,params:unknown[]=[]){await db.exec('savepoint expected_error');try{const v=await rows(sql,params);await db.exec('release savepoint expected_error');return v}catch(e){await db.exec('rollback to savepoint expected_error; release savepoint expected_error');throw e}}
const insight=async(w=workspace,p=project)=>(await one<{value:ProjectInsight}>('select public.project_insight($1,$2) value',[w,p])).value;
const dateBefore=(days:number)=>new Date(Date.parse(today+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
async function entry(minutes:number,daysBefore=0,p=project){return one<{id:string}>('insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,$3,$4) returning id',[workspace,p,dateBefore(daysBefore),minutes])}

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',file),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@insight.test',now()),($2,'manager@insight.test',now()),($3,'member@insight.test',now()),($4,'outsider@insight.test',now())",[owner,manager,member,outsider]);
},60000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec("begin; set local timezone='Pacific/Honolulu'");
 today=(await one<{value:string}>("select (now() at time zone 'Pacific/Kiritimati')::date::text value")).value;
 await login(owner);workspace=(await one<{id:string}>("select * from public.create_workspace('Insights','Pacific/Kiritimati','EUR')")).id;
 await db.query("select public.invite_member($1,'manager@insight.test','manager')",[workspace]);
 await db.query("select public.invite_member($1,'member@insight.test','member')",[workspace]);
 project=(await one<{id:string}>("insert into public.projects(workspace_id,code,name)values($1,'A','Project')returning id",[workspace])).id;
 await login(member);await db.exec('select public.accept_invitations()');
 await login(manager);await db.exec('select public.accept_invitations()');
 await login(outsider);foreignWorkspace=(await one<{id:string}>("select * from public.create_workspace('Foreign','UTC','USD')")).id;
 foreignProject=(await one<{id:string}>("insert into public.projects(workspace_id,code,name)values($1,'B','Other')returning id",[foreignWorkspace])).id;
 await login(manager);
});
afterEach(async()=>{await db.exec('rollback')});

describe('project insight database authorization and snapshot',()=>{
 it('returns an empty all-time snapshot for an owner and manager in workspace-local time',async()=>{
  for(const person of [owner,manager]){
   await login(person);const value=await insight();
   expect(value).toMatchObject({project:{id:project,due_date:null,progress_percent:null,progress_updated_at:null},as_of:today,progress_date:null,total_minutes:0,first_work_date:null,last_work_date:null,recent_daily:[],tasks:{total:0,done:0,overdue:0}});
   expect((await one<{value:string}>('select current_date::text value')).value).not.toBe(value.as_of);
  }
 });
 it('denies members, outsiders, downgraded managers, disabled users and unauthenticated callers',async()=>{
  for(const person of [member,outsider]){await login(person);await expect(attempt('select public.project_insight($1,$2)',[workspace,project])).rejects.toMatchObject({code:'42501'})}
  for(const role of ['member','disabled']){await login(owner);await db.query('select public.set_member_role($1,$2,$3)',[workspace,manager,role]);await login(manager);await expect(attempt('select public.project_insight($1,$2)',[workspace,project])).rejects.toMatchObject({code:'42501'})}
  await login('','anon');await expect(attempt('select public.project_insight($1,$2)',[workspace,project])).rejects.toMatchObject({code:'42501'});
  await login('');await expect(attempt('select public.project_insight($1,$2)',[workspace,project])).rejects.toMatchObject({code:'42501'});
 });
 it('fails closed for foreign, missing and null workspace/project identifiers',async()=>{
  for(const [w,p] of [[workspace,foreignProject],[foreignWorkspace,project],[foreignWorkspace,foreignProject],[workspace,outsider],[outsider,project],[workspace,null],[null,project]]){
   await expect(attempt('select public.project_insight($1,$2)',[w,p])).rejects.toMatchObject({code:'42501'});
  }
 });
 it('includes all team statuses and over 1000 entries, excluding future work and active timers',async()=>{
  await db.query('insert into public.time_entries(workspace_id,project_id,work_date,minutes) select $1,$2,$3,1 from generate_series(1,1105)',[workspace,project,today]);
  await entry(120,400);await entry(10,27);await entry(20,28);await entry(999,-1);
  const otherProject=(await one<{id:string}>("insert into public.projects(workspace_id,code,name)values($1,'C','Separate')returning id",[workspace])).id;
  await entry(100,1,otherProject);
  await login(member);const approved=await entry(30,2);await entry(45,1);
  await db.query('select public.submit_entries($1,$2,$3)',[workspace,dateBefore(2),dateBefore(1)]);
  await entry(60);await db.query("select public.start_timer($1,$2,'Running',true)",[workspace,project]);
  await login(manager);await db.query('select public.review_entry($1,true)',[approved.id]);
  const value=await insight();
  expect(value.total_minutes).toBe(1390);expect(value.first_work_date).toBe(dateBefore(400));expect(value.last_work_date).toBe(today);
  expect(value.recent_daily).toEqual([{work_date:dateBefore(27),minutes:10},{work_date:dateBefore(2),minutes:30},{work_date:dateBefore(1),minutes:45},{work_date:today,minutes:1165}]);
 });
 it('counts project tasks separately with strict local-date overdue and done handling',async()=>{
  await db.query("insert into public.tasks(workspace_id,project_id,title,status,due_date) values($1,$2,'Late','todo',$3::date-1),($1,$2,'Today','doing',$3),($1,$2,'Finished','done',$3::date-1),($1,$2,'No deadline','todo',null),($1,$2,'Future','todo',$3::date+1)",[workspace,project,today]);
  expect((await insight()).tasks).toEqual({total:5,done:1,overdue:1});
 });
 it('keeps the RPC stable, invoker-only, search-path constrained and inaccessible to anon',async()=>{
  await db.exec('reset role');
  expect(await one("select prosecdef,provolatile,proconfig,has_function_privilege('anon',oid,'execute') anon_access,has_function_privilege('authenticated',oid,'execute') user_access from pg_proc where oid='public.project_insight(uuid,uuid)'::regprocedure")).toMatchObject({prosecdef:false,provolatile:'s',proconfig:['search_path=""'],anon_access:false,user_access:true});
 });
});

describe('project planning persistence',()=>{
 it('converts progress freshness to the workspace calendar date',async()=>{
  await db.query('update public.projects set progress_percent=30 where id=$1',[project]);
  await db.exec('reset role; alter table public.projects disable trigger project_progress_guard');
  await db.query("update public.projects set progress_updated_at='2026-10-13T12:30:00Z' where id=$1",[project]);
  await db.exec('alter table public.projects enable trigger project_progress_guard');await login(manager);
  expect((await insight()).progress_date).toBe('2026-10-14');
 });
 it('creates a server timestamp for reported progress and preserves planning in old-client upserts',async()=>{
  const saved=await one<{due_date:string;progress_percent:string;stamp:string}>('update public.projects set due_date=$1,progress_percent=35.5 where id=$2 returning due_date::text,progress_percent,progress_updated_at::text stamp',[today,project]);
  expect(saved.stamp).toBeTruthy();
  await db.query("insert into public.projects(id,workspace_id,code,name)values($1,$2,'A','Legacy edit') on conflict(id) do update set name=excluded.name",[project,workspace]);
  expect(await one('select due_date::text,progress_percent,progress_updated_at::text stamp from public.projects where id=$1',[project])).toEqual(saved);
  await db.query('update public.projects set progress_percent=35.5 where id=$1',[project]);
  expect((await one('select progress_updated_at::text stamp from public.projects where id=$1',[project])).stamp).toBe(saved.stamp);
  await db.query('update public.projects set progress_percent=36 where id=$1',[project]);
  expect((await one('select progress_updated_at::text stamp from public.projects where id=$1',[project])).stamp).not.toBe(saved.stamp);
  await db.query('update public.projects set progress_percent=null,due_date=null where id=$1',[project]);
  expect(await one('select progress_percent,progress_updated_at,due_date from public.projects where id=$1',[project])).toEqual({progress_percent:null,progress_updated_at:null,due_date:null});
 });
 it('sets timestamps on insert and rejects timestamp tampering on direct inserts or updates',async()=>{
  const saved=await one<{id:string;stamp:string}>("insert into public.projects(workspace_id,code,name,progress_percent)values($1,'P','Planned',0)returning id,progress_updated_at::text stamp",[workspace]);
  expect(saved.stamp).toBeTruthy();
  for(const stamp of [null,'2000-01-01T00:00:00Z','2100-01-01T00:00:00Z'])await expect(attempt('update public.projects set progress_percent=50,progress_updated_at=$1 where id=$2',[stamp,saved.id])).rejects.toMatchObject({code:'42501'});
  await expect(attempt("insert into public.projects(workspace_id,code,name,progress_percent,progress_updated_at)values($1,'T','Forged',50,'2000-01-01')",[workspace])).rejects.toMatchObject({code:'42501'});
 });
 it('rejects unsupported progress and calendar dates at the direct database boundary',async()=>{
  for(const progress of [-1,100.01,'NaN','Infinity','-Infinity'])await expect(attempt('update public.projects set progress_percent=$1 where id=$2',[progress,project])).rejects.toMatchObject({code:'23514'});
  for(const date of ['infinity','-infinity','1999-12-31','2101-01-01','2026-02-30'])await expect(attempt('update public.projects set due_date=$1 where id=$2',[date,project])).rejects.toThrow();
  for(const [progress,date] of [[0,'2000-01-01'],[100,'2100-12-31'],[null,null]])expect(await rows('update public.projects set progress_percent=$1,due_date=$2 where id=$3 returning id',[progress,date,project])).toHaveLength(1);
 });
});
