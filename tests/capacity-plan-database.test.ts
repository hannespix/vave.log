import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002',planner='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004';
let db:PGlite; let workspace:string; let project:string;
const rows=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const result=await rows(sql,args);await db.exec('release savepoint expected_failure');return result}catch(error){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw error}}
const phase=(name:string,from:string|null,to:string|null,p=project) => one<{id:string}>('insert into public.project_phases(workspace_id,project_id,name,starts_on,ends_on) values($1,$2,$3,$4,$5) returning id',[workspace,p,name,from,to]);
const type=(name:string) => one<{id:string}>('insert into public.service_types(workspace_id,name) values($1,$2) returning id',[workspace,name]);
const row=(user:string|null,serviceType:string|null,p=project) => one<{id:string}>('insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id) values($1,$2,$3,$4) returning id',[workspace,p,user,serviceType]);
const book=(day:string,extra:Record<string,unknown>={}) => one('insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable,phase_id,service_type_id) values($1,$2,$3,60,$4,$5,$6,$7) returning *',[workspace,extra.project??project,day,'Arbeit',extra.billable??true,extra.phase_id??null,extra.service_type_id??null]);

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'member@example.org',now()),($3,'planner@example.org',now()),($4,'outsider@example.org',now())",[owner,member,planner,outsider]);
},120000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec('begin');await login();
 workspace=(await one<{id:string}>("select * from public.create_workspace('Studio','Europe/Berlin','EUR')")).id;
 await db.query("select public.invite_member($1,'member@example.org','member')",[workspace]);
 await db.query("select public.invite_member($1,'planner@example.org','member','projektplanung')",[workspace]);
 await login(member);await db.exec('select public.accept_invitations()');
 await login(planner);await db.exec('select public.accept_invitations()');
 await login();
 project=(await one<{id:string}>("insert into public.projects(workspace_id,code,name,budget_minutes) values($1,'EXP','Expo Pavillon',60000) returning id",[workspace])).id;
});
afterEach(async()=>{await db.exec('rollback')});

describe('Recht „Kapazität planen“',()=>{
 it('Administration, Leitung und Projektplanung planen; Personal und Lesezugriff sehen nur',async()=>{
  const level=async(t:string) => (await one<{v:string}>("select private.template_rights($1)->>'planning' v",[t])).v;
  await db.exec('reset role');
  expect(await level('admin')).toBe('edit');expect(await level('leitung')).toBe('edit');expect(await level('projektplanung')).toBe('edit');
  expect(await level('personal')).toBe('view');expect(await level('lesen')).toBe('view');expect(await level('mitarbeit')).toBe('none');expect(await level('finanzen')).toBe('none');
  const valid=async(p:string) => (await one<{v:boolean}>(`select private.valid_permissions('{"projects":"view","tasks":"view","time_team":"none","absences_team":"none","planning":"${p}","strengths":"none","finance":"none","team":"none","settings":"none"}'::jsonb) v`)).v;
  expect(await valid('edit')).toBe(true);expect(await valid('view')).toBe(true);expect(await valid('alles')).toBe(false);
 });
 it('die Planerin schreibt den Plan, das Mitglied nicht – sieht aber die eigenen Zeilen',async()=>{
  const pm=await type('PM');
  await login(planner);
  const mine=await row(member,pm.id),theirs=await row(planner,pm.id);
  await db.query("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-16',480),($1,$3,'2026-11-16',960)",[workspace,mine.id,theirs.id]);
  await login(member);
  expect((await rows('select id from public.capacity_rows where workspace_id=$1',[workspace])).map(r=>r.id)).toEqual([mine.id]);
  expect(await rows('select minutes from public.capacity_cells where workspace_id=$1',[workspace])).toEqual([{minutes:480}]);
  await expect(attempt('insert into public.capacity_rows(workspace_id,project_id,user_id) values($1,$2,$3)',[workspace,project,member])).rejects.toThrow(/row-level security/);
  await expect(attempt("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-23',60)",[workspace,mine.id])).rejects.toThrow(/row-level security/);
  expect(await attempt('update public.capacity_cells set minutes=60 where row_id=$1 returning minutes',[mine.id])).toEqual([]);
  await expect(attempt("insert into public.service_types(workspace_id,name) values($1,'3D')",[workspace])).rejects.toThrow(/row-level security/);
  await expect(attempt("insert into public.project_phases(workspace_id,project_id,name) values($1,$2,'Pitch')",[workspace,project])).rejects.toThrow(/row-level security/);
  await login(outsider);
  expect(await rows('select id from public.capacity_rows')).toEqual([]);expect(await rows('select 1 from public.capacity_cells')).toEqual([]);
  expect(await rows('select 1 from public.service_types')).toEqual([]);expect(await rows('select 1 from public.project_phases')).toEqual([]);
 });
 it('Wochenwerte gelten nur für Montage und Zeilen nur für Personen und Projekte des Workspace',async()=>{
  const r=await row(member,null);
  await expect(attempt("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-17',60)",[workspace,r.id])).rejects.toThrow(/check/);
  await expect(attempt("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-16',0)",[workspace,r.id])).rejects.toThrow(/check/);
  await expect(attempt('insert into public.capacity_rows(workspace_id,project_id,user_id) values($1,$2,$3)',[workspace,project,outsider])).rejects.toThrow(/foreign key/);
  await db.query("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-16',60)",[workspace,r.id]);
  await db.query('delete from public.capacity_rows where id=$1',[r.id]);
  expect(await rows('select 1 from public.capacity_cells where row_id=$1',[r.id])).toEqual([]);
 });
});

describe('Buchung auf Phase und Leistungsart',()=>{
 it('ergänzt die Phase aus dem Zeitraum und die Leistungsart aus dem Kapazitätsplan',async()=>{
  const concept=await phase('Konzept','2026-11-01','2026-11-30');await phase('Entwurf','2026-12-01','2026-12-31');
  const threeD=await type('3D');await row(member,threeD.id);
  await login(member);
  const e=await book('2026-11-17');
  expect(e.phase_id).toBe(concept.id);expect(e.service_type_id).toBe(threeD.id);
  // Außerhalb aller Phasen bleibt die Phase leer; eine ausdrückliche Wahl bleibt bestehen.
  expect((await book('2027-02-01')).phase_id).toBeNull();
  const other=(await one("select id from public.project_phases where name='Entwurf'")).id;
  expect((await book('2026-11-18',{phase_id:other})).phase_id).toBe(other);
 });
 it('wählt nichts, wenn zwei Phasen am selben Tag laufen oder die Person zwei Rollen im Projekt hat',async()=>{
  await phase('Konzept','2026-11-01','2026-11-30');await phase('Begleitung','2026-11-15','2026-12-15');
  const a=await type('3D'),b=await type('2D');await row(member,a.id);await row(member,b.id);
  await login(member);
  const e=await book('2026-11-17');
  expect(e.phase_id).toBeNull();expect(e.service_type_id).toBeNull();
 });
 it('lehnt die Phase eines anderen Projekts ab',async()=>{
  const second=(await one<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'P2','Zweites') returning id",[workspace])).id;
  const foreign=await phase('Pitch',null,null,second);
  await expect(attempt('insert into public.time_entries(workspace_id,project_id,work_date,minutes,phase_id) values($1,$2,$3,60,$4)',[workspace,project,'2026-11-17',foreign.id])).rejects.toThrow('Die Phase gehört nicht zum gewählten Projekt.');
 });
 it('löst die Zuordnung, wenn Phase oder Leistungsart gelöscht werden – auch an freigegebenen Zeiten',async()=>{
  const p=await phase('Konzept','2026-11-01','2026-11-30'),t=await type('PM');
  await login(member);
  const e=await book('2026-11-17',{service_type_id:t.id});
  await db.query("select public.submit_entries($1,'2026-11-17','2026-11-17')",[workspace]);
  await login();await db.query('select public.review_entry($1,true)',[e.id]);
  await db.query('delete from public.project_phases where id=$1',[p.id]);await db.query('delete from public.service_types where id=$1',[t.id]);
  expect(await one('select status,phase_id,service_type_id from public.time_entries where id=$1',[e.id])).toEqual({status:'approved',phase_id:null,service_type_id:null});
 });
});

describe('„Abrechenbar“ entscheidet das Projekt',()=>{
 it('Mitarbeitende übernehmen die Vorgabe des Projekts, auch beim Wechsel des Projekts',async()=>{
  const internal=(await one<{id:string}>("insert into public.projects(workspace_id,code,name,billable_default) values($1,'INT','Intern',false) returning id",[workspace])).id;
  await login(member);
  expect((await book('2026-11-17',{billable:false})).billable).toBe(true);
  const e=await book('2026-11-18',{project:internal,billable:true});
  expect(e.billable).toBe(false);
  expect((await one('update public.time_entries set billable=true where id=$1 returning billable',[e.id])).billable).toBe(false);
  expect((await one('update public.time_entries set project_id=$2 where id=$1 returning billable',[e.id,project])).billable).toBe(true);
 });
 it('wer Projekte oder Teamzeiten bearbeitet, darf abweichen',async()=>{
  await login(planner);
  expect((await book('2026-11-17',{billable:false})).billable).toBe(false);
  await login();
  expect((await book('2026-11-17',{billable:false})).billable).toBe(false);
 });
 it('ein Timer bucht nach der Vorgabe des Projekts',async()=>{
  await db.query('update public.projects set billable_default=false where id=$1',[project]);
  await login(member);
  const t=await one<{id:string}>('select * from public.start_timer($1,$2,$3,$4)',[workspace,project,'Timer',true]);
  await db.exec('reset role');await db.query("update public.running_timers set started_at=clock_timestamp()-interval '30 minutes' where id=$1",[t.id]);await login(member);
  const [e]=await rows('select * from public.stop_timer($1)',[t.id]);
  expect(e.billable).toBe(false);
 });
});

describe('Plan importieren',()=>{
 const plan=(extra:Record<string,unknown>={}) => ({service_types:['PM','3D'],projects:[{project_id:project,budget_minutes:12000,
  phases:[{name:'Concept Design',starts_on:'2026-11-02',ends_on:'2026-11-29'},{name:'Supervision',starts_on:'2026-11-30',ends_on:'2026-12-20'}],
  rows:[{user_id:member,service_type:'3D',offered_minutes:4800,cells:{'2026-11-16':1200,'2026-11-23':2400,'2026-11-30':0}},{user_id:null,service_type:'pm',cells:{'2026-11-16':480}}]}],...extra});
 it('legt Leistungsarten, Phasen, Zeilen und Wochenwerte in einem Schritt an und ersetzt beim zweiten Mal',async()=>{
  await login(planner);
  const result=(await one<{r:Record<string,number>}>('select public.import_capacity_plan($1,$2::jsonb) r',[workspace,JSON.stringify(plan())])).r;
  expect(result).toMatchObject({projects:1,created_projects:0,rows:2,cells:3,phases:2,service_types:2});
  const planned=await rows(`select m.email,s.name,r.offered_minutes,(select sum(c.minutes) from public.capacity_cells c where c.row_id=r.id)::int total
   from public.capacity_rows r left join public.memberships m on m.workspace_id=r.workspace_id and m.user_id=r.user_id left join public.service_types s on s.id=r.service_type_id
   where r.workspace_id=$1 order by r.position`,[workspace]);
  expect(planned).toEqual([{email:'member@example.org',name:'3D',offered_minutes:4800,total:3600},{email:null,name:'PM',offered_minutes:null,total:480}]);
  // Das Zeitbudget des Projekts bleibt: Es war schon gepflegt.
  expect((await one('select budget_minutes from public.projects where id=$1',[project])).budget_minutes).toBe(60000);
  const again=(await one<{r:Record<string,number>}>('select public.import_capacity_plan($1,$2::jsonb) r',[workspace,JSON.stringify(plan())])).r;
  expect(again).toMatchObject({rows:2,service_types:0});
  expect(Number((await one('select count(*) n from public.capacity_rows where workspace_id=$1',[workspace])).n)).toBe(2);
  expect(Number((await one('select count(*) n from public.project_phases where workspace_id=$1',[workspace])).n)).toBe(2);
 });
 it('legt fehlende Projekte nur mit Projektrecht an und nimmt niemanden ohne Planungsrecht',async()=>{
  const fresh={projects:[{create:{code:'NEU-1',name:'Neuer Pitch',budget_minutes:9600},rows:[{user_id:member,cells:{'2026-11-16':600}}]}]};
  await login(member);
  await expect(attempt('select public.import_capacity_plan($1,$2::jsonb)',[workspace,JSON.stringify(fresh)])).rejects.toThrow('Keine Berechtigung für diesen Bereich.');
  await login(planner);
  const result=(await one<{r:Record<string,number>}>('select public.import_capacity_plan($1,$2::jsonb) r',[workspace,JSON.stringify(fresh)])).r;
  expect(result).toMatchObject({projects:1,created_projects:1,rows:1,cells:1});
  expect((await one("select budget_minutes,billable_default from public.projects where code='NEU-1'"))).toEqual({budget_minutes:9600,billable_default:true});
  await expect(attempt('select public.import_capacity_plan($1,$2::jsonb)',[workspace,JSON.stringify({projects:[]})])).rejects.toThrow('Der Plan enthält keine Projekte.');
  await expect(attempt('select public.import_capacity_plan($1,$2::jsonb)',[workspace,JSON.stringify({projects:[{project_id:'99999999-9999-4999-8999-999999999999',rows:[]}]})])).rejects.toThrow('Ein Projekt des Plans gehört nicht zu diesem Workspace.');
 });
});

describe('Ist neben dem Plan und Aufräumen',()=>{
 it('liefert gebuchte Zeit je Woche und je Phase mit den Rechten der Person',async()=>{
  const p=await phase('Konzept','2026-11-01','2026-11-30');
  await login(member);await book('2026-11-17');await book('2026-11-19');await book('2026-11-24');
  await login(planner);await book('2026-11-17');
  expect(await rows('select week_start::text w,minutes from public.capacity_actuals where workspace_id=$1 and user_id=$2 order by 1',[workspace,member])).toEqual([{w:'2026-11-16',minutes:120},{w:'2026-11-23',minutes:60}]);
  expect(await rows('select phase_id,minutes,billable_minutes,entries from public.phase_effort where workspace_id=$1',[workspace])).toEqual([{phase_id:p.id,minutes:240,billable_minutes:240,entries:4}]);
  await login(member);
  expect(await rows('select minutes from public.phase_effort where workspace_id=$1',[workspace])).toEqual([{minutes:180}]);
 });
 it('ein Workspace mit Plan, Phasen und Leistungsarten lässt sich löschen',async()=>{
  const p=await phase('Konzept','2026-11-01','2026-11-30'),t=await type('PM'),r=await row(member,t.id);
  await db.query("insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,'2026-11-16',60)",[workspace,r.id]);
  await login(member);await book('2026-11-17',{phase_id:p.id});
  await login();await db.query("select public.delete_workspace($1,'Studio',true)",[workspace]);
  await db.exec('reset role');
  expect(Number((await one('select (select count(*) from public.capacity_rows where workspace_id=$1)+(select count(*) from public.project_phases where workspace_id=$1)+(select count(*) from public.service_types where workspace_id=$1) n',[workspace])).n)).toBe(0);
 });
 it('die Demo bringt Leistungsarten, Phasen und einen Plan mit freien und überbuchten Wochen mit',async()=>{
  const demo=await one<{id:string}>("select * from public.demo_create_workspace('Plan demo','Europe/Berlin','de',gen_random_uuid())");
  expect((await rows('select name from public.service_types where workspace_id=$1 order by position',[demo.id])).map(r=>r.name)).toEqual(['PM','CD','Konzept','3D','2D','Motion']);
  const active=Number((await one("select count(*) n from public.projects where workspace_id=$1 and status='active'",[demo.id])).n);
  expect(Number((await one('select count(distinct project_id) n from public.project_phases where workspace_id=$1',[demo.id])).n)).toBe(active);
  const planRows=await rows('select project_id,user_id,service_type_id from public.capacity_rows where workspace_id=$1',[demo.id]);
  expect(new Set(planRows.map(r=>r.project_id)).size).toBe(Math.min(8,active));
  expect(planRows.filter(r=>r.user_id===owner).length).toBe(2);expect(planRows.some(r=>r.user_id===null)).toBe(true);
  expect(planRows.filter(r=>r.user_id).every(r=>r.service_type_id)).toBe(true);
  const cells=Number((await one('select count(*) n from public.capacity_cells where workspace_id=$1',[demo.id])).n);
  expect(cells).toBeGreaterThan(150);
  const perWeek=await rows(`select r.user_id,c.week_start,sum(c.minutes)::int m from public.capacity_cells c join public.capacity_rows r on r.id=c.row_id
   where c.workspace_id=$1 and r.user_id is not null group by 1,2`,[demo.id]);
  expect(perWeek.some(x=>x.m>2400)).toBe(true);expect(perWeek.some(x=>x.m<1800)).toBe(true);
  // Wiederholbar: ein zweiter Lauf legt nichts doppelt an.
  await db.query('select public.demo_refresh_workspace($1)',[demo.id]);
  expect(Number((await one('select count(*) n from public.capacity_rows where workspace_id=$1',[demo.id])).n)).toBe(planRows.length);
  expect(Number((await one('select count(*) n from public.capacity_cells where workspace_id=$1',[demo.id])).n)).toBe(cells);
  // Gebuchte Beispielzeiten der letzten Wochen tragen Phase und Leistungsart.
  expect(Number((await one('select count(*) n from public.time_entries where workspace_id=$1 and phase_id is not null and service_type_id is not null',[demo.id])).n)).toBeGreaterThan(0);
 });
});
