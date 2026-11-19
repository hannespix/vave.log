import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Zwei Firmen: Frankfurt (owner, pm, shared) und Shanghai (owner, lead, shared). `outsider` gehört zu keiner.
const owner='00000000-0000-4000-8000-000000000001',pm='00000000-0000-4000-8000-000000000002',lead='00000000-0000-4000-8000-000000000003',shared='00000000-0000-4000-8000-000000000004',outsider='00000000-0000-4000-8000-000000000005';
let db:PGlite; let ffm:string; let sha:string; let project:string;
const rows=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }
async function admin<T>(run:()=>Promise<T>) { await db.exec('reset role');try{return await run()}finally{await db.exec('set role authenticated')} }
async function attempt(sql:string,args:unknown[]=[]) {await db.exec('savepoint expected_failure');try{const result=await rows(sql,args);await db.exec('release savepoint expected_failure');return result}catch(error){await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');throw error}}
const monday=(offsetWeeks=0) => one<{d:string}>("select to_char(date_trunc('week',(now() at time zone 'Europe/Berlin')::date)::date+$1::int,'YYYY-MM-DD') d",[offsetWeeks*7]).then(r=>r.d);
const link=() => one('select * from public.link_workspaces($1,$2)',[ffm,sha]);
const offer=(note='') => one<{id:string;status:string;summary:Record<string,any>}>('select * from public.offer_project_handover($1,$2,$3)',[project,sha,note]);

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'pm@example.org',now()),($3,'lead@example.org',now()),($4,'shared@example.org',now()),($5,'outsider@example.org',now())",[owner,pm,lead,shared,outsider]);
},120000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec('begin');await login();
 ffm=(await one<{id:string}>("select * from public.create_workspace('VAVE Frankfurt','Europe/Berlin','EUR')")).id;
 sha=(await one<{id:string}>("select * from public.create_workspace('VAVE Shanghai','Asia/Shanghai','CNY')")).id;
 await db.query("select public.invite_member($1,'pm@example.org','manager')",[ffm]);
 await db.query("select public.invite_member($1,'shared@example.org','member')",[ffm]);
 await db.query("select public.invite_member($1,'lead@example.org','manager')",[sha]);
 await db.query("select public.invite_member($1,'shared@example.org','member')",[sha]);
 for(const u of [pm,lead,shared]){await login(u);await db.exec('select public.accept_invitations()');}
 await login();
 project=(await one<{id:string}>("insert into public.projects(workspace_id,code,name,client,budget_minutes,due_date,tags,billable_default) values($1,'EXP','Expo Pavillon','Nordlicht',6000,current_date+90,array['3d'],true) returning id",[ffm])).id;
});
afterEach(async()=>{await db.exec('rollback')});

describe('Firmen verknüpfen',()=>{
 it('verknüpft nur, wer in beiden Firmen die Einstellungen bearbeiten darf',async()=>{
  await login(pm);
  await expect(attempt('select * from public.link_workspaces($1,$2)',[ffm,sha])).rejects.toThrow(/Berechtigung/);
  await login(outsider);
  await expect(attempt('select * from public.link_workspaces($1,$2)',[ffm,sha])).rejects.toThrow(/Berechtigung/);
  await login();
  await expect(attempt('select * from public.link_workspaces($1,$1)',[ffm])).rejects.toThrow(/verschiedene/);
  const l=await link();
  expect([l.workspace_a,l.workspace_b].sort()).toEqual([ffm,sha].sort());expect(l.workspace_a<l.workspace_b).toBe(true);
  // Ein zweites Mal – auch in umgekehrter Reihenfolge – legt nichts doppelt an.
  await db.query('select public.link_workspaces($1,$2)',[sha,ffm]);
  expect(Number((await one('select count(*) n from public.workspace_links')).n)).toBe(1);
 });
 it('zeigt Mitgliedern die Schwesterfirma mit Namen, Fremden nichts',async()=>{
  await link();
  await login(pm);
  const sisters=await rows('select * from public.sister_workspaces($1)',[ffm]);
  expect(sisters).toHaveLength(1);
  // Die Leitung in Frankfurt darf trennen, aber in Shanghai nichts annehmen.
  expect(sisters[0]).toMatchObject({workspace_id:sha,name:'VAVE Shanghai',currency:'CNY',timezone:'Asia/Shanghai',can_accept:false,can_unlink:true});
  // Die Projektleitung aus Frankfurt ist in Shanghai kein Mitglied: Dort sieht sie nichts.
  expect(await rows('select * from public.sister_workspaces($1)',[sha])).toHaveLength(0);
  expect(await rows('select id from public.workspaces where id=$1',[sha])).toHaveLength(0);
  await login(lead);
  expect((await one('select * from public.sister_workspaces($1)',[sha]))).toMatchObject({workspace_id:ffm,name:'VAVE Frankfurt',can_accept:false});
  await login();
  expect((await one('select * from public.sister_workspaces($1)',[ffm]))).toMatchObject({can_accept:true,can_unlink:true});
  await login(outsider);
  expect(await rows('select * from public.sister_workspaces($1)',[ffm])).toHaveLength(0);
  expect(await rows('select * from public.workspace_links')).toHaveLength(0);
 });
 it('lässt Demo-Workspaces außen vor',async()=>{
  const demo=await one<{id:string}>("select * from public.demo_create_workspace('Demo','Europe/Berlin','de',gen_random_uuid())");
  await expect(attempt('select * from public.link_workspaces($1,$2)',[ffm,demo.id])).rejects.toThrow(/Demo/);
 });
 it('trennt von jeder Seite und zieht offene Angebote zurück',async()=>{
  await link();const h=await offer();
  await login(shared);
  await expect(attempt('select public.unlink_workspaces($1,$2)',[ffm,sha])).rejects.toThrow(/Berechtigung/);
  await login(outsider);
  await expect(attempt('select public.unlink_workspaces($1,$2)',[ffm,sha])).rejects.toThrow(/Berechtigung/);
  await login();
  await db.query('select public.unlink_workspaces($1,$2)',[sha,ffm]);
  expect(await rows('select * from public.workspace_links')).toHaveLength(0);
  expect((await one('select status,decided_at from public.project_handovers where id=$1',[h.id])).status).toBe('withdrawn');
  await expect(attempt('select * from public.offer_project_handover($1,$2,$3)',[project,sha,''])).rejects.toThrow(/nicht verknüpft/);
 });
});

describe('Projekt übergeben',()=>{
 beforeEach(async()=>{await link();});
 it('bietet mit Projektrecht an und hält eine Kurzfassung fest',async()=>{
  await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note) values($1,$2,current_date-3,600,'Arbeit')",[ffm,project]);
  await db.query("insert into public.tasks(workspace_id,project_id,title,status) values($1,$2,'Offen','todo'),($1,$2,'Fertig','done')",[ffm,project]);
  await login(shared);
  await expect(attempt('select * from public.offer_project_handover($1,$2,$3)',[project,sha,''])).rejects.toThrow(/Berechtigung/);
  await login(pm);
  const h=await offer('Bitte ab Dezember übernehmen.');
  expect(h.status).toBe('offered');
  expect(h.summary).toMatchObject({code:'EXP',name:'Expo Pavillon',client:'Nordlicht',budget_minutes:6000,booked_minutes:600,open_tasks:1,source_name:'VAVE Frankfurt',target_name:'VAVE Shanghai'});
  await expect(attempt('select * from public.offer_project_handover($1,$2,$3)',[project,sha,''])).rejects.toThrow(/schon ein offenes Angebot/);
  // Beide Firmen lesen das Angebot, Fremde nicht.
  await login(lead);expect(await rows('select id from public.project_handovers')).toHaveLength(1);
  await login(shared);expect(await rows('select id from public.project_handovers')).toHaveLength(1);
  await login(outsider);expect(await rows('select id from public.project_handovers')).toHaveLength(0);
  // Schreiben geht nur über die Funktionen.
  await login(lead);
  await expect(attempt("update public.project_handovers set status='accepted',decided_at=now()")).rejects.toThrow(/permission denied/);
 });
 it('legt das Projekt beim Annehmen in der Zielfirma an und archiviert das Original',async()=>{
  const week=await monday(),next=await monday(1),last=await monday(-1);
  const p1=(await one<{id:string}>("insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on,budget_minutes) values($1,$2,'Konzept',1,current_date-60,current_date-10,1200) returning id",[ffm,project])).id;
  await db.query("insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on,budget_minutes) values($1,$2,'Entwurf',2,current_date-9,current_date+40,3000)",[ffm,project]);
  const type=(await one<{id:string}>("insert into public.service_types(workspace_id,name) values($1,'3D') returning id",[ffm])).id;
  await db.query("insert into public.service_types(workspace_id,name) values($1,' 3d ')",[sha]);
  const pmType=(await one<{id:string}>("insert into public.service_types(workspace_id,name) values($1,'PM') returning id",[ffm])).id;
  // Drei Planzeilen: eine Person in beiden Firmen, eine nur in Frankfurt, eine nur mit Vergangenheit.
  const rowShared=(await one<{id:string}>('insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,offered_minutes,position) values($1,$2,$3,$4,4800,1) returning id',[ffm,project,shared,type])).id;
  const rowPm=(await one<{id:string}>('insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,position) values($1,$2,$3,$4,2) returning id',[ffm,project,pm,pmType])).id;
  const rowPast=(await one<{id:string}>('insert into public.capacity_rows(workspace_id,project_id,user_id,position) values($1,$2,$3,3) returning id',[ffm,project,owner])).id;
  await db.query('insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values($1,$2,$5,600),($1,$2,$6,960),($1,$2,$7,960),($1,$3,$6,240),($1,$4,$5,300)',[ffm,rowShared,rowPm,rowPast,last,week,next]);
  await db.query("insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,estimated_minutes,is_milestone,tags) values($1,$2,'Modell bauen','doing',$3,current_date+7,600,false,array['3d']),($1,$2,'Abstimmung','todo',$4,current_date+14,null,true,'{}'),($1,$2,'Briefing','done',$4,null,null,false,'{}')",[ffm,project,shared,pm]);
  await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note) values($1,$2,current_date-5,900,'Arbeit'),($1,$2,current_date-4,600,'Arbeit')",[ffm,project]);
  // In Shanghai gibt es das Kürzel schon.
  await db.query("insert into public.projects(workspace_id,code,name) values($1,'EXP','Anderes Projekt')",[sha]);
  await login(pm);const h=await offer();
  await expect(attempt('select * from public.accept_project_handover($1)',[h.id])).rejects.toThrow(/Berechtigung/);
  await login(shared);
  await expect(attempt('select * from public.accept_project_handover($1)',[h.id])).rejects.toThrow(/Berechtigung/);
  await login(lead);
  const done=await one<{status:string;target_project_id:string;decided_by:string}>('select * from public.accept_project_handover($1)',[h.id]);
  expect(done.status).toBe('accepted');expect(done.decided_by).toBe(lead);
  const np=await one('select * from public.projects where id=$1',[done.target_project_id]);
  expect(np).toMatchObject({workspace_id:sha,code:'EXP-2',name:'Expo Pavillon',client:'Nordlicht',status:'active',budget_minutes:4500,billable_default:true,tags:['3d']});
  // Nur die laufende Phase wandert; die abgeschlossene bleibt im Original.
  expect((await rows('select name,budget_minutes from public.project_phases where workspace_id=$1 and project_id=$2',[sha,np.id]))).toEqual([{name:'Entwurf',budget_minutes:3000}]);
  // Offene Aufgaben: die gemeinsame Person bleibt zugewiesen, die Frankfurter Projektleitung nicht.
  const tasks=await rows('select title,status,assignee_id,is_milestone,estimated_minutes,created_by from public.tasks where workspace_id=$1 and project_id=$2 order by title',[sha,np.id]);
  expect(tasks).toEqual([{title:'Abstimmung',status:'todo',assignee_id:null,is_milestone:true,estimated_minutes:null,created_by:lead},{title:'Modell bauen',status:'doing',assignee_id:shared,is_milestone:false,estimated_minutes:600,created_by:lead}]);
  // Plan ab dieser Woche: Leistungsart über den Namen gefunden bzw. angelegt, fehlende Person wird zur offenen Stelle.
  const plan=await rows(`select r.user_id,r.note,r.offered_minutes,st.name type,(select coalesce(sum(c.minutes),0)::int from public.capacity_cells c where c.row_id=r.id) m,
    (select min(c.week_start)::text from public.capacity_cells c where c.row_id=r.id) first from public.capacity_rows r left join public.service_types st on st.id=r.service_type_id
    where r.workspace_id=$1 and r.project_id=$2 order by r.position`,[sha,np.id]);
  expect(plan[0]).toEqual({user_id:shared,note:'',offered_minutes:4800,type:' 3d ',m:1920,first:week});
  expect(plan[1]).toMatchObject({user_id:null,offered_minutes:null,type:'PM',m:240,first:week});
  expect(plan[1].note.length).toBeGreaterThan(0);expect(plan).toHaveLength(2);
  expect(Number((await one("select count(*) n from public.service_types where workspace_id=$1",[sha])).n)).toBe(2);
  // Das Original: archiviert, Vergangenheit bleibt, künftige Planung ist weg.
  await login(pm);
  expect((await one('select status from public.projects where id=$1',[project])).status).toBe('archived');
  expect(Number((await one('select coalesce(sum(minutes),0) n from public.time_entries where project_id=$1',[project])).n)).toBe(1500);
  expect((await rows('select c.week_start::text w,c.minutes from public.capacity_cells c join public.capacity_rows r on r.id=c.row_id where r.project_id=$1 order by 1,2',[project]))).toEqual([{w:last,minutes:300},{w:last,minutes:600}]);
  expect(Number((await one('select count(*) n from public.project_phases where project_id=$1',[project])).n)).toBe(2);expect(p1).toBeTruthy();
  // Beide Protokolle kennen die Übergabe.
  await login();
  expect((await rows("select action from public.audit_log where workspace_id=$1 and action like 'handover%' order by created_at,action",[ffm])).map(r=>r.action)).toEqual(expect.arrayContaining(['handover_offer','handover_accepted']));
  expect((await rows("select action from public.audit_log where workspace_id=$1 and action like 'handover%'",[sha])).map(r=>r.action)).toEqual(['handover_accept']);
  // Ein entschiedenes Angebot lässt sich nicht noch einmal entscheiden, das archivierte Projekt nicht neu anbieten.
  await login(lead);
  await expect(attempt('select * from public.accept_project_handover($1)',[h.id])).rejects.toThrow(/schon entschieden/);
  await expect(attempt('select * from public.decline_project_handover($1)',[h.id])).rejects.toThrow(/schon entschieden/);
  await login(pm);
  await expect(attempt('select * from public.offer_project_handover($1,$2,$3)',[project,sha,''])).rejects.toThrow(/archiviertes Projekt/);
 });
 it('lehnt ab oder zieht zurück, jeweils nur mit Recht auf der richtigen Seite',async()=>{
  await login(pm);const h=await offer();
  await expect(attempt('select * from public.decline_project_handover($1)',[h.id])).rejects.toThrow(/Berechtigung/);
  await login(lead);
  await expect(attempt('select * from public.withdraw_project_handover($1)',[h.id])).rejects.toThrow(/Berechtigung/);
  expect((await one('select * from public.decline_project_handover($1)',[h.id])).status).toBe('declined');
  // Nach der Absage bleibt das Projekt aktiv und lässt sich neu anbieten – und zurückziehen.
  await login(pm);
  expect((await one('select status from public.projects where id=$1',[project])).status).toBe('active');
  const again=await offer();
  expect((await one('select * from public.withdraw_project_handover($1)',[again.id])).status).toBe('withdrawn');
  await login(lead);
  await expect(attempt('select * from public.accept_project_handover($1)',[again.id])).rejects.toThrow(/schon entschieden/);
  expect(Number((await one('select count(*) n from public.projects where workspace_id=$1',[sha])).n)).toBe(0);
 });
 it('nimmt nicht an, solange ein Timer auf dem Projekt läuft',async()=>{
  await login(pm);const h=await offer();
  await admin(()=>db.query('insert into public.running_timers(workspace_id,project_id,user_id) values($1,$2,$3)',[ffm,project,pm]));
  await login(lead);
  await expect(attempt('select * from public.accept_project_handover($1)',[h.id])).rejects.toThrow(/Timer/);
 });
 it('räumt Verknüpfung und Übergaben weg, wenn eine Firma gelöscht wird',async()=>{
  await offer();
  await db.query("select public.delete_workspace($1,'VAVE Shanghai',true)",[sha]);
  await admin(async()=>{
   expect((await rows('select 1 from public.workspace_links'))).toHaveLength(0);
   expect((await rows('select 1 from public.project_handovers'))).toHaveLength(0);
  });
  expect((await one('select status from public.projects where id=$1',[project])).status).toBe('active');
 });
});
