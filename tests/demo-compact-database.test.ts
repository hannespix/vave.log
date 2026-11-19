import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_MANIFEST } from '../src/shared/demo-data.js';

const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let db:PGlite;
const rows=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
const count=async(table:string,ws:string,where='') => Number((await one(`select count(*) n from ${table} where workspace_id=$1 ${where}`,[ws])).n);
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const result=await rows(sql,args);await db.exec('release savepoint expected_failure');return result}catch(error){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw error}}
const create=(locale='de') => one<{id:string}>("select * from public.demo_create_workspace('Kompakt','Europe/Berlin',$1,gen_random_uuid())",[locale]);

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'other@example.org',now())",[owner,other]);
},120000);
afterAll(async()=>{await db?.close()});beforeEach(async()=>{await db.exec('begin');await login()});afterEach(async()=>{await db.exec('rollback')});

describe('Kompakte Beispieldaten',()=>{
 it('eine neue Demo ist klein und vollständig: 7 Personen, 5 Projekte, 16 Aufgaben',async()=>{
  const w=await create();
  const demo=await one('select experience_version,manifest,manifest_version,refreshed_on from public.workspace_demos where workspace_id=$1',[w.id]);
  expect(demo.experience_version).toBe(6);expect(demo.manifest).toEqual(DEMO_MANIFEST);expect(demo.refreshed_on).toBeTruthy();
  expect(await count('public.memberships',w.id,'and is_demo')).toBe(7);
  expect(await count('public.projects',w.id)).toBe(5);
  expect(await count('public.tasks',w.id)).toBe(16);
  expect(await count('public.service_types',w.id)).toBe(6);
  expect(await count('public.project_phases',w.id)).toBe(10);
  expect(await count('public.finance_clients',w.id)).toBe(4);
  expect(await count('public.absences',w.id)).toBe(4);
  // Überschaubar: wenige hundert Zeilen statt mehrerer tausend.
  const entries=await count('public.time_entries',w.id);expect(entries).toBeGreaterThan(80);expect(entries).toBeLessThan(160);
  const cells=await count('public.capacity_cells',w.id);expect(cells).toBeGreaterThan(120);expect(cells).toBeLessThan(260);
  expect(await count('public.capacity_rows',w.id)).toBe(17);
 });
 it('jede Person hat Arbeitszeitmodell, Rolle und Stundensatz; zwei arbeiten Teilzeit',async()=>{
  const w=await create();
  const people=await rows('select display_name,demo_title,work_schedule,weekly_capacity_minutes,location,vacation_days_per_year,role from public.memberships where workspace_id=$1 and is_demo order by email',[w.id]);
  expect(people.map(p=>p.display_name)).toEqual(['Mara Lindqvist','Jonas Brecht','Aiko Tanaka','Leon Hartmann','Sofia Marini','Tobias Keller','Nora Feld']);
  expect(people.map(p=>p.weekly_capacity_minutes)).toEqual([2400,2400,2400,2400,1920,2400,1440]);
  expect(people.every(p=>p.demo_title&&p.location==='DE-HE'&&Number(p.vacation_days_per_year)===30)).toBe(true);
  expect(people.filter(p=>p.role==='manager')).toHaveLength(2);
  expect(await count('public.finance_staff_rates',w.id)).toBe(8);
 });
 it('zeigt jede Funktion an einem Beispiel: Zustände der Aufgaben und Zeiten, Abwesenheiten, Plan, Rechnungen',async()=>{
  const w=await create();
  const tasks=await rows('select status,is_milestone,assignee_id,due_date,repeat,estimated_minutes,tags from public.tasks where workspace_id=$1',[w.id]);
  expect(new Set(tasks.map(t=>t.status))).toEqual(new Set(['todo','doing','done']));
  expect(tasks.filter(t=>t.is_milestone)).toHaveLength(3);expect(tasks.filter(t=>!t.assignee_id)).toHaveLength(1);expect(tasks.filter(t=>t.repeat==='weekly')).toHaveLength(1);
  expect(tasks.filter(t=>t.assignee_id===owner)).toHaveLength(1);expect(tasks.every(t=>t.tags.length===1)).toBe(true);
  const today=(await one<{d:string}>("select (now() at time zone 'Europe/Berlin')::date::text d")).d;
  expect(tasks.some(t=>t.status!=='done'&&t.due_date&&new Date(t.due_date).toISOString().slice(0,10)<today)).toBe(true);
  const states=(await rows('select distinct status from public.time_entries where workspace_id=$1',[w.id])).map(r=>r.status);
  expect(states).toContain('approved');expect(states).toContain('submitted');
  // Phase und Leistungsart ergänzt die Datenbank beim Buchen; nicht abrechenbare Projekte bleiben es.
  expect(await count('public.time_entries',w.id,'and phase_id is not null and service_type_id is not null')).toBeGreaterThan(50);
  expect(Number((await one("select count(*) n from public.time_entries e join public.projects p on p.id=e.project_id where e.workspace_id=$1 and e.billable is distinct from p.billable_default and e.user_id<>$2",[w.id,owner])).n)).toBe(0);
  expect((await rows('select code,billable_default from public.projects where workspace_id=$1 order by code',[w.id])).filter(p=>!p.billable_default).map(p=>p.code)).toEqual(['INT-05','PIT-04']);
  const abs=(await rows('select kind,status,half_day from public.absences where workspace_id=$1',[w.id])).map(a=>`${a.kind}/${a.status}/${a.half_day}`).sort();
  expect(abs).toEqual(['sick/approved/','vacation/approved/','vacation/approved/pm','vacation/requested/']);
  // Kapazitätsplan: eine Person ist überbucht, eine Stelle ist offen, die angemeldete Person ist eingeplant.
  const perWeek=await rows(`select r.user_id,c.week_start,sum(c.minutes)::int m from public.capacity_cells c join public.capacity_rows r on r.id=c.row_id where c.workspace_id=$1 and r.user_id is not null group by 1,2`,[w.id]);
  expect(perWeek.filter(x=>x.m>2400).length).toBeGreaterThanOrEqual(2);expect(new Set(perWeek.filter(x=>x.m>2400).map(x=>x.user_id)).size).toBe(1);
  expect(await count('public.capacity_rows',w.id,'and user_id is null')).toBe(1);
  expect(Number((await one('select count(*) n from public.capacity_rows where workspace_id=$1 and user_id=$2',[w.id,owner])).n)).toBe(1);
  const invoices=(await rows('select i.status,i.number,i.is_demo,coalesce((select p.paid from public.finance_payments p where p.invoice_id=i.id),false) paid from public.finance_invoices i where i.workspace_id=$1 order by i.issue_date',[w.id]));
  expect(invoices.map(i=>i.status).sort()).toEqual(['draft','issued','issued']);expect(invoices.filter(i=>i.paid)).toHaveLength(1);
  expect(invoices.every(i=>i.is_demo&&(i.number===null||String(i.number).startsWith('DEMO-')))).toBe(true);
 });
 it('gibt es in allen drei Sprachen',async()=>{
  for(const locale of ['en','zh']){
   const w=await create(locale);
   expect(await count('public.tasks',w.id)).toBe(16);expect(await count('public.projects',w.id)).toBe(5);
   expect((await one("select name from public.projects where workspace_id=$1 and code='MUS-03'",[w.id])).name).toBe(locale==='en'?'Museum Night':'博物馆之夜');
  }
 });
 it('dieselbe Anfrage legt nichts doppelt an, und das Auffrischen lässt den Satz klein',async()=>{
  const request='99999999-9999-4999-8999-999999999999';
  const a=await one<{id:string}>("select * from public.demo_create_workspace('Kompakt','Europe/Berlin','de',$1)",[request]);
  const b=await one<{id:string}>("select * from public.demo_create_workspace('Kompakt','Europe/Berlin','de',$1)",[request]);
  expect(b.id).toBe(a.id);
  const before={entries:await count('public.time_entries',a.id),absences:await count('public.absences',a.id),rows:await count('public.capacity_rows',a.id),cells:await count('public.capacity_cells',a.id),phases:await count('public.project_phases',a.id)};
  await db.query('select public.demo_refresh_workspace($1)',[a.id]);
  expect({entries:await count('public.time_entries',a.id),absences:await count('public.absences',a.id),rows:await count('public.capacity_rows',a.id),cells:await count('public.capacity_cells',a.id),phases:await count('public.project_phases',a.id)}).toEqual(before);
 });
});

describe('Beispieldaten neu laden',()=>{
 it('ersetzt eigene Eingaben durch den kompakten Satz und behält Workspace, echte Mitglieder und Einladungen',async()=>{
  const w=await create();
  await db.query("select public.invite_member($1,'other@example.org','member')",[w.id]);
  await login(other);await db.exec('select public.accept_invitations()');await login();
  await db.query("select public.invite_member($1,'offen@example.org','member')",[w.id]);
  const extra=(await one<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'EIG-99','Eigenes Projekt') returning id",[w.id])).id;
  await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-11-02',30)",[w.id,extra]);
  await db.query("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Eigene Aufgabe')",[w.id,extra]);
  const result=(await one<{r:Record<string,number>}>('select public.demo_reset_workspace($1) r',[w.id])).r;
  expect(result).toEqual({people:7,projects:5,tasks:16});
  expect((await rows('select code from public.projects where workspace_id=$1 order by code',[w.id])).map(p=>p.code)).toEqual(['AUR-02','INT-05','MUS-03','NLP-01','PIT-04']);
  expect(await count('public.tasks',w.id)).toBe(16);expect(await count('public.memberships',w.id,'and is_demo')).toBe(7);
  expect((await rows('select email from public.memberships where workspace_id=$1 and not is_demo order by email',[w.id])).map(m=>m.email)).toEqual(['other@example.org','owner@example.org']);
  expect(await count('public.invitations',w.id)).toBe(1);
  expect((await one('select name from public.workspaces where id=$1',[w.id])).name).toBe('Kompakt');
  expect((await rows('select number from public.finance_invoices where workspace_id=$1 and number is not null order by number',[w.id]))).toHaveLength(2);
  // Ein zweites Mal geht genauso.
  await db.query('select public.demo_reset_workspace($1)',[w.id]);
  expect(await count('public.projects',w.id)).toBe(5);expect(await count('public.memberships',w.id,'and is_demo')).toBe(7);
 });
 it('eine archivierte kompakte Demo ist für niemanden mehr sichtbar und lässt sich nicht neu laden',async()=>{
  const w=await create();
  await db.query('select public.demo_archive_workspace($1)',[w.id]);
  expect(await rows('select 1 from public.projects where workspace_id=$1',[w.id])).toEqual([]);
  expect(await rows('select 1 from public.time_entries where workspace_id=$1',[w.id])).toEqual([]);
  await expect(attempt('select public.demo_reset_workspace($1)',[w.id])).rejects.toThrow('DEMO_FORBIDDEN');
 });
 it('darf nur, wer die Demo angelegt hat – und nicht bei laufendem Timer oder in einem echten Workspace',async()=>{
  const w=await create();
  await db.query("select public.invite_member($1,'other@example.org','manager')",[w.id]);
  await login(other);await db.exec('select public.accept_invitations()');
  await expect(attempt('select public.demo_reset_workspace($1)',[w.id])).rejects.toThrow('DEMO_FORBIDDEN');
  await login();
  const p=(await one<{id:string}>("select id from public.projects where workspace_id=$1 and code='MUS-03'",[w.id])).id;
  await db.query("select public.start_timer($1,$2,'läuft',true)",[w.id,p]);
  await expect(attempt('select public.demo_reset_workspace($1)',[w.id])).rejects.toThrow(/DEMO_CONFLICT/);
  const real=(await one<{id:string}>("select * from public.create_workspace('Echt','Europe/Berlin','EUR')")).id;
  await expect(attempt('select public.demo_reset_workspace($1)',[real])).rejects.toThrow('DEMO_FORBIDDEN');
 });
});
