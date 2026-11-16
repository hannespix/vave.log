import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let db:PGlite;
const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
const migration=files.find(f=>f.endsWith('_demo_aktueller_stand.sql'))!;
const rows=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }
async function install() { await db.exec('reset role');await db.exec(readFileSync(join('supabase/migrations',migration),'utf8'));await login(); }
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const result=await rows(sql,args);await db.exec('release savepoint expected_failure');return result}catch(error){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw error}}
const create=(name='Stand demo') => one<{id:string}>("select * from public.demo_create_workspace($1,'Europe/Berlin','de',gen_random_uuid())",[name]);
/** Lässt die Demo altern: Zeiten und Termine liegen danach `days` Tage weiter zurück. */
async function age(workspace:string,days:number) {
 await db.exec('reset role');await db.exec('alter table public.time_entries disable trigger user;alter table public.tasks disable trigger user');
 await db.query('update public.time_entries set work_date=work_date-$2::int where workspace_id=$1',[workspace,days]);
 await db.query('update public.tasks set due_date=due_date-$2::int where workspace_id=$1 and due_date is not null',[workspace,days]);
 await db.exec('alter table public.time_entries enable trigger user;alter table public.tasks enable trigger user');await login();
}
const people=(workspace:string) => rows("select * from public.memberships where workspace_id=$1 and is_demo and role<>'disabled' order by user_id",[workspace]);
const count=async(sql:string,args:unknown[]) => Number((await one<{n:number}>(sql,args)).n);

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of files.filter(f=>f<migration))await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'other@example.org',now())",[owner,other]);
},120000);
afterAll(async()=>{await db?.close()});beforeEach(async()=>{await db.exec('begin');await login()});afterEach(async()=>{await db.exec('rollback')});

describe('Beispieldaten auf dem aktuellen Stand',()=>{
 it('gibt jeder Beispielperson Arbeitszeitmodell, Wochenstunden und Urlaubsanspruch',async()=>{
  await install();const w=await create(),all=await people(w.id);
  expect(all.length).toBeGreaterThan(100);
  for(const m of all){
   expect(m.work_schedule).toHaveLength(7);
   expect(m.weekly_capacity_minutes).toBe((m.work_schedule as number[]).reduce((a,b)=>a+b,0));
   expect(m.weekly_capacity_minutes).toBeGreaterThanOrEqual(1440);
   expect(Number(m.vacation_days_per_year)).toBeGreaterThanOrEqual(25);
  }
  expect(new Set(all.map(m=>m.weekly_capacity_minutes)).size).toBeGreaterThan(2);
  const frankfurt=all.filter(m=>/Frankfurt/i.test(m.demo_studio));
  expect(frankfurt.length).toBeGreaterThan(0);expect(frankfurt.every(m=>m.location==='DE-HE'&&Number(m.vacation_days_per_year)===30)).toBe(true);
  expect((await one('select refreshed_on,experience_version from public.workspace_demos where workspace_id=$1',[w.id])).refreshed_on).toBeTruthy();
 });
 it('legt Abwesenheiten in allen Zuständen und Urlaubskonten an, ohne Überschneidungen',async()=>{
  await install();const w=await create();
  const abs=await rows('select * from public.absences where workspace_id=$1',[w.id]);
  const kinds=new Set(abs.map(a=>`${a.kind}/${a.status}/${a.half_day?'halb':'ganz'}`));
  for(const k of ['vacation/approved/ganz','vacation/requested/ganz','sick/approved/ganz','vacation/approved/halb']) expect(kinds).toContain(k);
  expect(abs.length).toBeGreaterThan(40);
  expect(abs.every(a=>a.starts_on<=a.ends_on)).toBe(true);
  expect(abs.filter(a=>a.status==='approved').every(a=>a.decided_by===owner)).toBe(true);
  expect(await count(`select count(*) n from public.absences a join public.absences b on a.workspace_id=b.workspace_id and a.user_id=b.user_id and a.id<b.id
   and a.starts_on<=b.ends_on and b.starts_on<=a.ends_on where a.workspace_id=$1`,[w.id])).toBe(0);
  const running=await count("select count(*) n from public.absences where workspace_id=$1 and status='approved' and starts_on<=current_date and ends_on>=current_date",[w.id]);
  expect(running).toBeGreaterThan(0);
  expect(await count('select count(*) n from public.vacation_balances where workspace_id=$1 and year=extract(year from current_date)::int and carried_over>0',[w.id])).toBeGreaterThan(20);
 });
 it('versieht Aufgaben mit Kategorien, Bewertungen sowie Beginn und Abschluss',async()=>{
  await install();const w=await create();
  const tasks=await rows('select * from public.tasks where workspace_id=$1',[w.id]);
  expect(tasks.every(t=>t.tags.length===1)).toBe(true);expect(new Set(tasks.map(t=>t.tags[0])).size).toBeGreaterThan(4);
  const done=tasks.filter(t=>t.status==='done');expect(done.length).toBeGreaterThan(0);
  expect(done.every(t=>t.done_at&&t.started_at&&t.started_at<=t.done_at)).toBe(true);
  expect(done.filter(t=>t.assignee_id).every(t=>t.rating>=3&&t.rating<=5)).toBe(true);
  expect(tasks.filter(t=>t.status!=='done').every(t=>t.done_at===null&&t.rating===null)).toBe(true);
 });
 it('holt eine gealterte Demo zurück in die Gegenwart und bleibt beim zweiten Aufruf stehen',async()=>{
  await install();const w=await create();await age(w.id,35);
  const before=await count('select count(*) n from public.time_entries where workspace_id=$1',[w.id]);
  const result=(await one<{r:any}>('select public.demo_refresh_workspace($1) r',[w.id])).r;
  expect(result.entries).toBeGreaterThan(500);expect(result.tasks_moved).toBeGreaterThan(0);
  expect(await count('select count(*) n from public.time_entries where workspace_id=$1',[w.id])).toBe(before+result.entries);
  const span=await one("select (current_date-max(work_date)) gap from public.time_entries where workspace_id=$1",[w.id]);
  expect(Number(span.gap)).toBeGreaterThanOrEqual(1);expect(Number(span.gap)).toBeLessThanOrEqual(3);
  expect(await count(`select count(*) n from public.time_entries e join public.absences a on a.workspace_id=e.workspace_id and a.user_id=e.user_id
   and a.status='approved' and a.half_day='' and e.work_date between a.starts_on and a.ends_on where e.workspace_id=$1 and e.work_date>=current_date-34`,[w.id])).toBe(0);
  expect(await count(`select count(*) n from public.time_entries e join public.memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
   where e.workspace_id=$1 and e.work_date>=current_date-34 and m.is_demo and (m.work_schedule->>(extract(isodow from e.work_date)::int-1))::int=0`,[w.id])).toBe(0);
  const states=new Set((await rows('select distinct status from public.time_entries where workspace_id=$1 and work_date>=current_date-34',[w.id])).map(r=>r.status));
  expect(states).toContain('approved');
  const due=await one("select (max(due_date)-current_date) d from public.tasks where workspace_id=$1 and status<>'done'",[w.id]);
  expect(Number(due.d)).toBeGreaterThanOrEqual(20);expect(Number(due.d)).toBeLessThanOrEqual(22);
  await db.exec('reset role');expect(await count('select count(*) n from private.demo_seed_context',[])).toBe(0);await login();
  const snapshot=async()=>({entries:await rows('select * from public.time_entries where workspace_id=$1 order by id',[w.id]),tasks:await rows('select * from public.tasks where workspace_id=$1 order by id',[w.id]),
   absences:await rows('select * from public.absences where workspace_id=$1 order by id',[w.id]),people:await people(w.id)});
  const first=await snapshot();const again=(await one<{r:any}>('select public.demo_refresh_workspace($1) r',[w.id])).r;
  expect(again).toMatchObject({people:0,absences:0,tasks_moved:0,tasks_tagged:0,entries:0});expect(await snapshot()).toEqual(first);
 });
 it('überschreibt keine von Hand gepflegten Werte',async()=>{
  await install();const w=await create(),person=(await people(w.id))[0]!;
  await db.query("select public.set_work_schedule($1,$2,'[240,240,240,0,0,0,0]'::jsonb,null,null)",[w.id,person.user_id]);
  await db.query('select public.demo_refresh_workspace($1)',[w.id]);
  const after=await one('select work_schedule,weekly_capacity_minutes from public.memberships where workspace_id=$1 and user_id=$2',[w.id,person.user_id]);
  expect(after.work_schedule).toEqual([240,240,240,0,0,0,0]);expect(after.weekly_capacity_minutes).toBe(720);
 });
 it('frischt bestehende Demos beim Einspielen auf und lässt echte Arbeitsbereiche unberührt',async()=>{
  const w=await create('Vorher');const real=await one<{id:string}>("select * from public.create_workspace('Echt','Europe/Berlin','EUR')");
  expect((await people(w.id)).every(m=>m.work_schedule===null)).toBe(true);
  await age(w.id,30);await install();
  expect((await people(w.id)).every(m=>m.work_schedule&&m.weekly_capacity_minutes>0)).toBe(true);
  expect(await count('select count(*) n from public.absences where workspace_id=$1',[w.id])).toBeGreaterThan(40);
  expect(await count('select count(*) n from public.absences where workspace_id=$1',[real.id])).toBe(0);
  const mine=await one('select work_schedule,weekly_capacity_minutes,vacation_days_per_year from public.memberships where workspace_id=$1 and user_id=$2',[real.id,owner]);
  expect(mine).toMatchObject({work_schedule:null,vacation_days_per_year:null});
 });
 it('weist fremde Konten, archivierte Demos und echte Arbeitsbereiche ab',async()=>{
  await install();const w=await create();const real=await one<{id:string}>("select * from public.create_workspace('Echt','Europe/Berlin','EUR')");
  await expect(attempt('select public.demo_refresh_workspace($1)',[real.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  await login(other);await expect(attempt('select public.demo_refresh_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
  await login();await db.query('select public.demo_archive_workspace($1)',[w.id]);
  await expect(attempt('select public.demo_refresh_workspace($1)',[w.id])).rejects.toThrow(/DEMO_FORBIDDEN/);
 });
 it('lässt sich mit Abwesenheiten, Urlaubskonten und Hinweisen endgültig löschen',async()=>{
  await install();const w=await create('Zum Löschen');
  expect(await count('select count(*) n from public.vacation_balances where workspace_id=$1',[w.id])).toBeGreaterThan(0);
  await db.query('select public.demo_archive_workspace($1)',[w.id]);
  await db.query("select public.delete_workspace($1,'Zum Löschen',true)",[w.id]);
  await db.exec('reset role');
  for(const table of ['workspaces','memberships','absences','vacation_balances','notifications','time_suggestions','time_entries','tasks','finance_offers','finance_invoice_payments'])
   expect(await count(`select count(*) n from public.${table} where ${table==='workspaces'?'id':'workspace_id'}=$1`,[w.id]),table).toBe(0);
 });
 it('hält Beginn und Abschluss außerhalb der Auffrischung weiter fest',async()=>{
  await install();const w=await create();
  const t=await one("select id,done_at,started_at from public.tasks where workspace_id=$1 and status='done' limit 1",[w.id]);
  await db.query("update public.tasks set done_at='2020-01-01',started_at='2020-01-01' where id=$1",[t.id]);
  expect(await one('select done_at,started_at from public.tasks where id=$1',[t.id])).toEqual({done_at:t.done_at,started_at:t.started_at});
  await expect(attempt("insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,status) select workspace_id,project_id,user_id,current_date,60,'approved' from public.time_entries where workspace_id=$1 and user_id<>$2 limit 1",[w.id,owner])).rejects.toThrow();
 });
});
