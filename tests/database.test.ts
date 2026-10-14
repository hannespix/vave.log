import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

// Real PostgreSQL policies and triggers, not mocks. Only Supabase's auth provider
// schema is stubbed; each application query runs with its actual API database role.
const owner = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const manager = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000004';
const unverified = '00000000-0000-4000-8000-000000000005';
let db: PGlite;
let workspace: string;
let foreignWorkspace: string;
let project: string;
let foreignProject: string;
async function login(id: string, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}
async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
async function first<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await rows<T>(sql, params))[0]!;
}
async function entry(minutes = 60, day = '2026-10-13') {
  return first<{id:string; status:string}>(`insert into public.time_entries
    (workspace_id, project_id, work_date, minutes, note, billable)
    values ($1, $2, $3, $4, 'Arbeit', true) returning *`, [workspace, project, day, minutes]);
}
async function attempt(sql: string, params: unknown[] = []) {
  // Isolate intentional errors without aborting the fixture transaction.
  await db.exec('savepoint expected_error');
  try { const result = await db.query(sql, params); await db.exec('release savepoint expected_error'); return result; }
  catch (error) { await db.exec('rollback to savepoint expected_error'); await db.exec('release savepoint expected_error'); throw error; }
}
async function timer() {
  return first<{id:string}>('select * from public.start_timer($1,$2,$3,$4)', [workspace, project, 'Timer', true]);
}
async function ageTimer(id: string, interval: string) {
  await db.exec('reset role');
  await db.query('update public.running_timers set started_at = clock_timestamp() - $1::interval where id=$2', [interval, id]);
  await login(member);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  const dir = join(process.cwd(), 'supabase/migrations');
  for (const file of readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir,file),'utf8'));
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values
    ($1,'owner@example.org',now()), ($2,'member@example.org',now()),
    ($3,'manager@example.org',now()), ($4,'outsider@example.org',now()),
    ($5,'pending@example.org',null)`, [owner,member,manager,outsider,unverified]);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  await login(owner);
  workspace = (await first<{id:string}>("select * from public.create_workspace('Studio','Europe/Berlin','EUR')")).id;
  await db.query("select public.invite_member($1,'member@example.org','member')",[workspace]);
  await db.query("select public.invite_member($1,'manager@example.org','manager')",[workspace]);
  await login(member); await db.exec('select public.accept_invitations()');
  await login(manager); await db.exec('select public.accept_invitations()');
  project = (await first<{id:string}>(`insert into public.projects(workspace_id,code,name) values($1,'VAV','Brand') returning id`,[workspace])).id;
  await login(outsider);
  foreignWorkspace = (await first<{id:string}>("select * from public.create_workspace('Other','UTC','USD')")).id;
  foreignProject = (await first<{id:string}>(`insert into public.projects(workspace_id,code,name) values($1,'OTH','Other') returning id`,[foreignWorkspace])).id;
  await login(member);
});
afterEach(async () => { await db.exec('rollback'); });

describe('database authorization', () => {
  it('only lists workspaces, projects and memberships for the current tenant', async () => {
    expect((await rows('select id from public.workspaces')).map(x=>x.id)).toEqual([workspace]);
    expect((await rows('select id from public.projects')).map(x=>x.id)).toEqual([project]);
    expect(await rows('select * from public.memberships where workspace_id=$1',[foreignWorkspace])).toEqual([]);
    expect(await rows('select * from public.memberships where workspace_id=$1',[workspace])).toHaveLength(3);
  });
  it('does not let a member create projects or elevate membership', async () => {
    await expect(attempt("insert into public.projects(workspace_id,code,name) values($1,'BAD','Bad')",[workspace])).rejects.toThrow();
    await expect(attempt("update public.memberships set role='owner' where user_id=$1",[member])).rejects.toThrow();
    await expect(attempt("insert into public.memberships(workspace_id,user_id,role,email,display_name) values($1,$2,'owner','x','x')",[foreignWorkspace,member])).rejects.toThrow();
    await expect(attempt("select public.set_member_role($1,$2,'owner')",[workspace,member])).rejects.toThrow(/Berechtigung/);
  });
  it('allows managers to edit projects but forbids inviting or changing roles', async () => {
    await login(manager);
    expect(await rows("update public.projects set name='New' where id=$1 returning name",[project])).toEqual([{name:'New'}]);
    await expect(attempt("select public.invite_member($1,'outsider@example.org','member')",[workspace])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select public.set_member_role($1,$2,'manager')",[workspace,member])).rejects.toThrow(/Berechtigung/);
  });
  it('protects the final owner and allows an owner to delegate', async () => {
    await login(owner);
    await expect(attempt("select public.set_member_role($1,$2,'member')",[workspace,owner])).rejects.toThrow(/Owner/);
    await db.query("select public.set_member_role($1,$2,'owner')",[workspace,manager]);
    await db.query("select public.set_member_role($1,$2,'member')",[workspace,owner]);
    expect((await first('select role from public.memberships where workspace_id=$1 and user_id=$2',[workspace,owner])).role).toBe('member');
  });
  it('accepts invitations only for a confirmed matching auth email, without overwriting roles', async () => {
    await login(owner);
    await db.query("select public.invite_member($1,' PENDING@example.org ','manager')",[workspace]);
    await login(unverified);
    await expect(attempt('select public.accept_invitations()')).rejects.toThrow(/bestätig/);
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[unverified]);
    await login(unverified);
    expect((await first('select public.accept_invitations() as n')).n).toBe(1);
    expect((await first('select public.accept_invitations() as n')).n).toBe(0);
    await login(owner);
    await db.query("select public.invite_member($1,'member@example.org','manager')",[workspace]);
    await login(member); await db.exec('select public.accept_invitations()');
    expect((await first('select role from public.memberships where user_id=$1',[member])).role).toBe('member');
  });
  it('rejects owner invitations through the direct RPC', async () => {
    await login(owner);
    await expect(attempt("select public.invite_member($1,'outsider@example.org','owner')",[workspace])).rejects.toThrow(/Rolle/);
    expect(await rows("select * from public.invitations where workspace_id=$1 and email='outsider@example.org'",[workspace])).toHaveLength(0);
  });
  it('rejects invalid workspace timezone and unauthenticated provisioning', async () => {
    await expect(attempt("select public.create_workspace('Bad','Mars/City','EUR')")).rejects.toThrow(/Zeitzone/);
    await login('', 'anon');
    await expect(attempt("select public.create_workspace('Bad','UTC','EUR')")).rejects.toThrow(/permission denied/);
    await expect(attempt('select * from public.time_entries')).rejects.toThrow(/permission denied/);
  });
  it('does not accept another email or an expired invitation', async () => {
    await login(owner);
    await db.query("select public.invite_member($1,'outsider@example.org','member')",[workspace]);
    await login(member);
    expect((await first('select public.accept_invitations() as n')).n).toBe(0);
    await db.exec('reset role');
    await db.query("update public.invitations set expires_at=now()-interval '1 second' where workspace_id=$1",[workspace]);
    await login(outsider);
    expect((await first('select public.accept_invitations() as n')).n).toBe(0);
    expect(await rows('select * from public.memberships where workspace_id=$1',[workspace])).toHaveLength(0);
  });
  it('enables RLS everywhere and pins privileged function search paths', async () => {
    await db.exec('reset role');
    expect(await rows("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and relkind='r' and not relrowsecurity")).toEqual([]);
    expect(await rows("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and prosecdef and not coalesce(proconfig @> array['search_path=\"\"'],false)")).toEqual([]);
    expect(await rows("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and prosecdef and has_function_privilege('anon',p.oid,'execute')")).toEqual([]);
  });
});

describe('database member offboarding', () => {
  it('denies disabled users all workspace reads, writes and authorized RPCs', async () => {
    const e=await entry();
    await db.query("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Kept task')",[workspace,project]);
    await login(owner);
    await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
    await login(member);
    expect(await rows('select * from public.workspaces where id=$1',[workspace])).toHaveLength(0);
    for (const table of ['memberships','projects','tasks','time_entries','running_timers','invitations','audit_log']) {
      expect(await rows(`select * from public.${table} where workspace_id=$1`,[workspace])).toHaveLength(0);
    }
    await expect(attempt("insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-10-13',1)",[workspace,project])).rejects.toThrow();
    await expect(attempt("select * from public.start_timer($1,$2,'Hidden timer',true)",[workspace,project])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace])).rejects.toThrow(/Berechtigung/);
    await expect(attempt('select * from public.review_entry($1,true)',[e.id])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select public.set_member_role($1,$2,'owner')",[workspace,member])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select public.invite_member($1,'outsider@example.org','member')",[workspace])).rejects.toThrow(/Berechtigung/);
    await login(owner);
    expect(await rows('select * from public.time_entries where id=$1',[e.id])).toHaveLength(1);
    expect((await first('select role from public.memberships where workspace_id=$1 and user_id=$2',[workspace,member])).role).toBe('disabled');
  });
  it('never disables the final owner', async () => {
    await login(owner);
    await expect(attempt("select public.set_member_role($1,$2,'disabled')",[workspace,owner])).rejects.toThrow(/Owner/);
    expect((await first('select role from public.memberships where workspace_id=$1 and user_id=$2',[workspace,owner])).role).toBe('owner');
  });
  it('keeps a disabled membership disabled after reinvitation until the owner explicitly restores it', async () => {
    await login(owner);
    await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
    await db.query("select public.invite_member($1,'member@example.org','manager')",[workspace]);
    await login(member);
    expect((await first('select public.accept_invitations() as n')).n).toBe(0);
    expect(await rows('select * from public.workspaces where id=$1',[workspace])).toHaveLength(0);
    await login(owner);
    expect((await first('select role from public.memberships where workspace_id=$1 and user_id=$2',[workspace,member])).role).toBe('disabled');
    await db.query("select public.set_member_role($1,$2,'member')",[workspace,member]);
    await login(member);
    expect(await rows('select * from public.workspaces where id=$1',[workspace])).toHaveLength(1);
  });
  it('atomically discards a disabled member timer, preserves entries and receipts, and frees their other workspace', async () => {
    const other=(await first<{id:string}>("select * from public.create_workspace('Personal','UTC','EUR')")).id;
    const otherProject=(await first<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'P','Personal') returning id",[other])).id;
    const completed=await timer(); await ageTimer(completed.id,'125 seconds');
    const saved=await rows<{id:string}>('select * from public.stop_timer($1)',[completed.id]);
    const running=await timer();
    await login(owner);
    await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
    expect(await rows('select * from public.time_entries where id=$1',[saved[0]!.id])).toHaveLength(1);
    expect(await rows("select * from public.audit_log where entity_id=$1 and action='discard_on_disable'",[running.id])).toHaveLength(1);
    await db.exec('reset role');
    expect(await rows('select * from public.running_timers where id=$1',[running.id])).toHaveLength(0);
    expect(await rows('select * from private.timer_receipts where id=$1',[completed.id])).toHaveLength(1);
    await login(member);
    await expect(attempt('select * from public.stop_timer($1)',[completed.id])).rejects.toThrow(/Berechtigung/);
    const next=await first<{workspace_id:string}>("select * from public.start_timer($1,$2,'Next',true)",[other,otherProject]);
    expect(next.workspace_id).toBe(other);
  });
  it('does not discard a timer belonging to another active workspace', async () => {
    const other=(await first<{id:string}>("select * from public.create_workspace('Personal','UTC','EUR')")).id;
    const otherProject=(await first<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'P','Personal') returning id",[other])).id;
    const running=await first<{id:string}>("select * from public.start_timer($1,$2,'Other workspace',true)",[other,otherProject]);
    await login(owner);
    await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
    await login(member);
    expect((await first('select * from public.running_timers')).id).toBe(running.id);
  });
});

describe('database entries and workflow', () => {
  it.each(['infinity','-infinity','1999-12-31','2101-01-01'])('rejects direct task due date %s on insert and update', async (date) => {
    await expect(attempt("insert into public.tasks(workspace_id,project_id,title,due_date) values($1,$2,'Invalid date',$3) returning id",[workspace,project,date])).rejects.toThrow();
    const task=await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title,due_date) values($1,$2,'Valid date','2026-10-13') returning id",[workspace,project]);
    await expect(attempt('update public.tasks set due_date=$1 where id=$2 returning id',[date,task.id])).rejects.toThrow();
    expect((await first<{date:string}>('select due_date::text as date from public.tasks where id=$1',[task.id])).date).toBe('2026-10-13');
  });
  it('accepts null and the inclusive supported task date boundaries', async () => {
    for (const date of [null,'2000-01-01','2100-12-31']) {
      const saved=await first<{date:string|null}>("insert into public.tasks(workspace_id,project_id,title,due_date) values($1,$2,'Supported date',$3) returning due_date::text as date",[workspace,project,date]);
      expect(saved.date).toBe(date);
    }
  });
  it.each(['1999-12-31','2101-01-01'])('rejects direct time-entry date %s outside the application range', async (date) => {
    await expect(attempt('insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,$3,60) returning id',[workspace,project,date])).rejects.toThrow();
    const e=await entry();
    await expect(attempt('update public.time_entries set work_date=$1 where id=$2 returning id',[date,e.id])).rejects.toThrow();
  });
  it('rejects infinite and unsupported submission date predicates before arithmetic', async () => {
    for (const date of ['infinity','-infinity','1999-12-31','2101-01-01']) {
      await expect(attempt('select public.submit_entries($1,$2,$2)',[workspace,date])).rejects.toThrow(/Datumsbereich/);
    }
  });
  it('hides other peoples time from members and permits managers to see team time', async () => {
    await entry();
    await login(owner); await entry(30);
    await login(member); expect(await rows('select * from public.time_entries')).toHaveLength(1);
    await login(manager); expect(await rows('select * from public.time_entries')).toHaveLength(2);
    await login(outsider); expect(await rows('select * from public.time_entries')).toHaveLength(0);
  });
  it('enforces tenant project and assignee references in direct writes', async () => {
    await expect(attempt(`insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-10-13',60)`,[workspace,foreignProject])).rejects.toThrow();
    await expect(attempt(`insert into public.tasks(workspace_id,project_id,title,assignee_id) values($1,$2,'Task',$3)`,[workspace,project,outsider])).rejects.toThrow();
    await expect(attempt(`insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Task')`,[workspace,foreignProject])).rejects.toThrow();
  });
  it('lets members collaborate on tasks while preserving creator and tenant', async () => {
    const task=await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title,assignee_id) values($1,$2,'Draft',$3) returning id",[workspace,project,manager]);
    await login(manager);
    expect(await rows("update public.tasks set title='Ready',status='doing' where id=$1 returning title",[task.id])).toEqual([{title:'Ready'}]);
    await expect(attempt('update public.tasks set created_by=$1 where id=$2',[manager,task.id])).rejects.toThrow(/Ersteller/);
    await expect(attempt('update public.tasks set workspace_id=$1,project_id=$2 where id=$3',[foreignWorkspace,foreignProject,task.id])).rejects.toThrow();
    expect(await rows('delete from public.tasks where id=$1 returning id',[task.id])).toHaveLength(1);
  });
  it('prevents forged identity, status and timer provenance on direct entry writes', async () => {
    for (const [column,value] of [['user_id',owner],['status','approved'],['timer_id',outsider]]) {
      await expect(attempt(`insert into public.time_entries(workspace_id,project_id,work_date,minutes,${column}) values($1,$2,'2026-10-13',60,$3)`,[workspace,project,value])).rejects.toThrow();
    }
    const e=await entry();
    await expect(attempt("update public.time_entries set status='approved' where id=$1",[e.id])).rejects.toThrow();
    await expect(attempt('update public.time_entries set workspace_id=$1, project_id=$2 where id=$3',[foreignWorkspace,foreignProject,e.id])).rejects.toThrow();
    await expect(attempt('update public.time_entries set user_id=$1 where id=$2',[owner,e.id])).rejects.toThrow();
  });
  it('enforces positive integer time and daily totals for insert and update', async () => {
    await expect(attempt(`insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-10-13',0)`,[workspace,project])).rejects.toThrow();
    const a=await entry(1000); const b=await entry(440);
    await expect(attempt(`insert into public.time_entries(workspace_id,project_id,work_date,minutes) values($1,$2,'2026-10-13',1)`,[workspace,project])).rejects.toThrow(/1440/);
    await expect(attempt('update public.time_entries set minutes=441 where id=$1',[b.id])).rejects.toThrow(/1440/);
    expect(await rows('delete from public.time_entries where id=$1 returning id',[a.id])).toHaveLength(1);
  });
  it('submits only own drafts and makes submitted and approved content immutable', async () => {
    const e=await entry();
    expect((await first("select public.submit_entries($1,'2026-10-13','2026-10-13') as n",[workspace])).n).toBe(1);
    expect(await rows('update public.time_entries set minutes=1 where id=$1 returning id',[e.id])).toHaveLength(0);
    expect(await rows('delete from public.time_entries where id=$1 returning id',[e.id])).toHaveLength(0);
    await expect(attempt('select * from public.review_entry($1,true)',[e.id])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    expect((await first('select * from public.review_entry($1,true)',[e.id])).status).toBe('approved');
    await expect(attempt('select * from public.review_entry($1,false)',[e.id])).rejects.toThrow(/eingereicht/);
    expect(await rows('update public.time_entries set minutes=1 where id=$1 returning id',[e.id])).toHaveLength(0);
  });
  it('allows a manager to return submitted work to draft and blocks cross-tenant review', async () => {
    const e=await entry(); await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await login(outsider); await expect(attempt('select * from public.review_entry($1,true)',[e.id])).rejects.toThrow(/Berechtigung/);
    await login(manager); expect((await first('select * from public.review_entry($1,false)',[e.id])).status).toBe('draft');
    await login(member); expect(await rows('update public.time_entries set minutes=90 where id=$1 returning minutes',[e.id])).toEqual([{minutes:90}]);
  });
  it('lets a manager revoke an approval back to draft, but never members or non-approved entries', async () => {
    const e=await entry(); await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await expect(attempt('select * from public.revoke_approval($1)',[e.id])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    await expect(attempt('select * from public.revoke_approval($1)',[e.id])).rejects.toThrow(/freigegebene/);
    expect((await first('select * from public.review_entry($1,true)',[e.id])).status).toBe('approved');
    await login(outsider); await expect(attempt('select * from public.revoke_approval($1)',[e.id])).rejects.toThrow(/Berechtigung/);
    await login(manager); expect((await first('select * from public.revoke_approval($1)',[e.id])).status).toBe('draft');
    await login(member); expect(await rows('update public.time_entries set minutes=95 where id=$1 returning minutes',[e.id])).toEqual([{minutes:95}]);
  });
  it('records meaningful audit events and prevents tampering', async () => {
    const e=await entry(); await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await login(owner);
    expect(await rows("select * from public.audit_log where entity_id=$1 and action='submit'",[e.id])).toHaveLength(1);
    await expect(attempt('delete from public.audit_log')).rejects.toThrow();
  });
  it('audits manual entry changes without copying sensitive notes', async () => {
    const e=await entry();
    await db.query("update public.time_entries set note='Private client details' where id=$1",[e.id]);
    await db.query('delete from public.time_entries where id=$1',[e.id]);
    await login(owner);
    const log=await rows<{action:string;details:unknown}>('select action,details from public.audit_log where entity_id=$1 order by action',[e.id]);
    expect(log.map(x=>x.action)).toEqual(['create','delete','update']);
    expect(JSON.stringify(log)).not.toContain('Private client details');
  });
});

describe('database timer lifecycle', () => {
  it('allows only one active timer per person and hides it from other people', async () => {
    const a=await timer();
    expect((await timer()).id).toBe(a.id);
    await expect(attempt('select * from public.start_timer($1,$2,$3,true)',[workspace,project,'Different'])).rejects.toThrow(/Timer/);
    await login(owner); expect(await rows('select * from public.running_timers')).toHaveLength(0);
    await expect(attempt('select * from public.stop_timer($1)',[a.id])).rejects.toThrow(/Timer/);
    await expect(attempt('delete from public.running_timers where id=$1',[a.id])).rejects.toThrow();
  });
  it('stops atomically, saves integer minutes and retries without duplicate entries', async () => {
    const a=await timer(); await ageTimer(a.id,'125 seconds');
    const firstStop=await rows('select * from public.stop_timer($1)',[a.id]);
    expect(firstStop).toHaveLength(1); expect(firstStop[0]!.minutes).toBe(2);
    expect(firstStop[0]!.timer_id).toBe(a.id);
    expect(await rows('select * from public.stop_timer($1)',[a.id])).toEqual(firstStop);
    expect(await rows('select * from public.running_timers')).toHaveLength(0);
    expect(await rows('select * from public.time_entries')).toHaveLength(1);
  });
  it('retains the original stop response if its draft was subsequently deleted', async () => {
    const a=await timer(); await ageTimer(a.id,'125 seconds');
    const original=await rows('select * from public.stop_timer($1)',[a.id]);
    await db.query('delete from public.time_entries where timer_id=$1',[a.id]);
    expect(await rows('select * from public.stop_timer($1)',[a.id])).toEqual(original);
    expect(await rows('select * from public.time_entries')).toHaveLength(0);
  });
  it('denies a stop receipt after workspace membership is revoked', async () => {
    const a=await timer(); await ageTimer(a.id,'125 seconds');
    await db.query('select * from public.stop_timer($1)',[a.id]);
    await db.query('delete from public.time_entries where timer_id=$1',[a.id]);
    await db.exec('reset role');
    await db.query('delete from public.memberships where workspace_id=$1 and user_id=$2',[workspace,member]);
    await login(member);
    await expect(attempt('select * from public.stop_timer($1)',[a.id])).rejects.toThrow(/Berechtigung/);
  });
  it('does not lose a timer on too-short, too-long or daily-limit failures', async () => {
    const a=await timer();
    await expect(attempt('select * from public.stop_timer($1)',[a.id])).rejects.toThrow(/Minute/);
    await ageTimer(a.id,'25 hours');
    await expect(attempt('select * from public.stop_timer($1)',[a.id])).rejects.toThrow(/24 Stunden/);
    await ageTimer(a.id,'125 seconds');
    const day=(await first<{day:string}>("select (clock_timestamp() at time zone 'Europe/Berlin')::date::text as day")).day;
    await entry(1440,day);
    await expect(attempt('select * from public.stop_timer($1)',[a.id])).rejects.toThrow(/1440/);
    expect(await rows('select * from public.running_timers')).toHaveLength(1);
    expect(await rows('select * from public.time_entries')).toHaveLength(1);
  });
  it('splits at workspace local midnight and preserves total minutes', async () => {
    // Select an actual IANA fixed-offset zone whose local time is near 01:00,
    // keeping the timer below its 24-hour maximum regardless of test run time.
    const utcHour=Number((await first<{hour:number}>('select extract(hour from clock_timestamp() at time zone \'UTC\') as hour')).hour);
    const offset=utcHour<=13 ? utcHour-1 : utcHour-25;
    const zone=offset===0 ? 'Etc/GMT' : `Etc/GMT${offset>0?'+':''}${offset}`;
    await db.exec('reset role');
    await db.query('update public.workspaces set timezone=$1 where id=$2',[zone,workspace]);
    await login(member); const a=await timer();
    await db.exec('reset role');
    await db.query(`update public.running_timers set started_at =
      (((clock_timestamp() at time zone $1)::date::timestamp - interval '30 minutes') at time zone $1)
      where id=$2`,[zone,a.id]);
    const total=Number((await first<{n:number}>('select floor(extract(epoch from(clock_timestamp()-started_at))/60) as n from public.running_timers where id=$1',[a.id])).n);
    await login(member);
    const result=await rows<{minutes:number;work_date:string}>('select * from public.stop_timer($1)',[a.id]);
    expect(result).toHaveLength(2); expect(result[0]!.minutes).toBe(30);
    expect(result.reduce((n,e)=>n+e.minutes,0)).toBe(total);
    expect(result[0]!.work_date).not.toBe(result[1]!.work_date);
  });
  it('discards only an owned timer, conceals existence and makes retries harmless', async () => {
    await expect(attempt('insert into public.running_timers(workspace_id,project_id,user_id) values($1,$2,$3)',[workspace,project,member])).rejects.toThrow();
    const a=await timer();
    await login(outsider);
    await db.query('select public.discard_timer($1)',[a.id]);
    await db.query('select public.discard_timer($1)',[outsider]);
    await login(member);
    expect(await rows('select * from public.running_timers')).toHaveLength(1);
    await db.query('select public.discard_timer($1)',[a.id]);
    await db.query('select public.discard_timer($1)',[a.id]);
    expect(await rows('select * from public.running_timers')).toHaveLength(0);
    expect(await rows('select * from public.time_entries')).toHaveLength(0);
    await login(owner);
    expect(await rows("select * from public.audit_log where entity_id=$1 and action='discard'",[a.id])).toHaveLength(1);
  });
});
