import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000004';
let db:PGlite; let workspace:string; let project:string;
const rows=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await db.query<T>(sql,args)).rows;
const one=async<T=Record<string,any>>(sql:string,args:unknown[]=[]) => (await rows<T>(sql,args))[0]!;
async function login(id=owner) { await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated'); }

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(join('supabase/migrations',f),'utf8'));
 await db.query("insert into auth.users(id,email,email_confirmed_at)values($1,'owner@example.org',now()),($2,'member@example.org',now()),($3,'outsider@example.org',now())",[owner,member,outsider]);
},120000);
afterAll(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec('begin');await login();
 workspace=(await one<{id:string}>("select * from public.create_workspace('Studio','Europe/Berlin','EUR')")).id;
 await db.query("select public.invite_member($1,'member@example.org','member')",[workspace]);
 await login(member);await db.exec('select public.accept_invitations()');await login();
 project=(await one<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'EXP','Expo') returning id",[workspace])).id;
});
afterEach(async()=>{await db.exec('rollback')});

describe('Leseregeln einmal je Abfrage',()=>{
 it('keine Leseregel ruft die Rechteprüfung je Zeile auf',async()=>{
  await db.exec('reset role');
  const slow=await rows(`select c.relname t,p.polname,pg_get_expr(p.polqual,p.polrelid) q from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace s on s.oid=c.relnamespace
   where s.nspname='public' and p.polcmd='r' and (pg_get_expr(p.polqual,p.polrelid) ~ 'private\\.can\\(' or pg_get_expr(p.polqual,p.polrelid) ~ 'current_role')`);
  expect(slow).toEqual([]);
 });
 it('die Abfrage über viele Zeiten prüft das Recht einmal, nicht je Zeile',async()=>{
  await login(member);
  await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes) select $1,$2,date '2026-01-01'+g,30 from generate_series(0,199) g",[workspace,project]);
  await login();
  const plan=(await rows<{['QUERY PLAN']:string}>('explain select * from public.time_entries where workspace_id=$1',[workspace])).map(r=>r['QUERY PLAN']).join('\n');
  expect(plan).not.toMatch(/Filter:.*private\.can\(/);expect(plan).not.toMatch(/Filter:.*current_role/);
  expect(plan).toMatch(/hashed SubPlan|ANY \(/);
 });
 it('wer was sieht, bleibt gleich: eigene Zeiten, Teamzeiten nur mit Recht, Fremde nichts',async()=>{
  await login(member);await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-11-17',60)",[workspace,project]);
  await login();await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-11-17',90)",[workspace,project]);
  const seen=async()=>(await rows('select minutes from public.time_entries where workspace_id=$1 order by minutes',[workspace])).map(r=>r.minutes);
  expect(await seen()).toEqual([60,90]);
  await login(member);expect(await seen()).toEqual([60]);
  expect((await rows('select code from public.projects where workspace_id=$1',[workspace])).map(r=>r.code)).toEqual(['EXP']);
  expect(await rows('select 1 from public.audit_log where workspace_id=$1',[workspace])).toEqual([]);
  await login(outsider);
  expect(await seen()).toEqual([]);expect(await rows('select 1 from public.projects')).toEqual([]);expect(await rows('select 1 from public.workspaces')).toEqual([]);expect(await rows('select 1 from public.memberships')).toEqual([]);
  // Deaktiviert: sofort nichts mehr sichtbar.
  await login();await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
  await login(member);expect(await seen()).toEqual([]);expect(await rows('select 1 from public.projects')).toEqual([]);
 });
});
