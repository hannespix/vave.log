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
    await expect(attempt("select public.invite_member($1,'member@example.org','manager')",[workspace])).rejects.toThrow(/Mitglied/);
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

describe('database rights per account', () => {
  const matrix = (over: Record<string,string> = {}) => JSON.stringify({ projects:'view', tasks:'edit', time_team:'none', absences_team:'none', planning:'none', strengths:'none', finance:'none', team:'none', settings:'none', ...over });
  it('resolves templates: Projektplanung edits projects and sees team time but may not approve; Lesezugriff only reads', async () => {
    await login(owner); await entry(30);
    await db.query("select public.set_member_rights($1,$2,'projektplanung')",[workspace,member]);
    await login(member);
    expect(await rows("update public.projects set name='Geplant' where id=$1 returning name",[project])).toEqual([{name:'Geplant'}]);
    const teamTime=await rows<{id:string}>('select id from public.time_entries');
    expect(teamTime).toHaveLength(1);
    await expect(attempt('select public.review_entry($1,true)',[teamTime[0]!.id])).rejects.toThrow(/Berechtigung/);
    await expect(attempt('select public.finance_list_invoices($1)',[workspace])).rejects.toThrow(/FINANCE_FORBIDDEN/);
    await login(owner); await db.query("select public.set_member_rights($1,$2,'lesen')",[workspace,member]);
    await login(member);
    expect(await rows("update public.projects set name='Nein' where id=$1 returning name",[project])).toEqual([]);
    await expect(attempt("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Nein') returning id",[workspace,project])).rejects.toThrow();
    expect((await first<{list:unknown[]}>('select public.finance_list_invoices($1) as list',[workspace])).list).toEqual([]);
    await expect(attempt("insert into public.finance_clients(workspace_id,name) values($1,'Kunde') returning id",[workspace])).rejects.toThrow();
    expect(await rows('select * from public.time_entries')).toHaveLength(1);
  });
  it('resolves templates: Personal decides absences and entitlements without finance or settings; Finanzen books but keeps out of the team', async () => {
    await login(owner); await db.query("select public.set_member_rights($1,$2,'personal')",[workspace,member]);
    await login(member);
    expect((await first<{vacation_days_per_year:string}>('select * from public.set_vacation_entitlement($1,$2,28)',[workspace,manager])).vacation_days_per_year).toBe('28.0');
    await expect(attempt('select public.finance_list_invoices($1)',[workspace])).rejects.toThrow(/FINANCE_FORBIDDEN/);
    await expect(attempt('select public.set_absence_approval($1,false)',[workspace])).rejects.toThrow(/Berechtigung/);
    await login(owner); await db.query("select public.set_member_rights($1,$2,'finanzen')",[workspace,member]);
    await login(member);
    expect(await rows("insert into public.finance_clients(workspace_id,name) values($1,'Kunde') returning name",[workspace])).toEqual([{name:'Kunde'}]);
    await expect(attempt('select * from public.set_vacation_entitlement($1,$2,20)',[workspace,manager])).rejects.toThrow(/Berechtigung/);
    await expect(attempt('select * from public.list_invitations($1)',[workspace])).rejects.toThrow(/Berechtigung/);
  });
  it('individual matrices: team right grants only what one has, never touches owners or oneself, invalid matrices are rejected, a role change resets', async () => {
    await login(owner);
    await db.query("select public.set_member_rights($1,$2,'individuell',$3)",[workspace,manager,matrix({ team:'edit' })]);
    await expect(attempt("select public.set_member_rights($1,$2,'individuell',$3)",[workspace,member,'{"projects":"none"}'])).rejects.toThrow(/Matrix/);
    await login(manager);
    await expect(attempt("select public.set_member_rights($1,$2,'finanzen')",[workspace,member])).rejects.toThrow(/selbst hast/);
    await expect(attempt("select public.set_member_rights($1,$2,'individuell',$3)",[workspace,member,matrix({ finance:'view' })])).rejects.toThrow(/selbst hast/);
    expect((await first<{rights_template:string}>("select * from public.set_member_rights($1,$2,'mitarbeit')",[workspace,member])).rights_template).toBe('mitarbeit');
    await expect(attempt("select public.set_member_rights($1,$2,'mitarbeit')",[workspace,owner])).rejects.toThrow(/Owner/);
    await expect(attempt("select public.set_member_rights($1,$2,'mitarbeit')",[workspace,manager])).rejects.toThrow(/eigenen Rechte/);
    await db.query("select public.invite_member($1,'neu@example.org','member','mitarbeit')",[workspace]);
    await expect(attempt("select public.invite_member($1,'neu2@example.org','member','finanzen')",[workspace])).rejects.toThrow(/selbst hast/);
    await expect(attempt("select public.invite_member($1,'neu3@example.org','manager')",[workspace])).rejects.toThrow(/selbst hast/);
    await login(owner); await db.query("select public.set_member_role($1,$2,'manager')",[workspace,manager]);
    expect(await first('select rights_template,permissions from public.memberships where workspace_id=$1 and user_id=$2',[workspace,manager])).toEqual({rights_template:null,permissions:null});
  });
  it('carries the template through the invitation and keeps legacy roles unchanged', async () => {
    await login(owner); await db.query("select public.invite_member($1,'outsider@example.org','member','lesen')",[workspace]);
    await login(outsider); await db.exec('select public.accept_invitations()');
    expect((await first<{rights_template:string}>('select rights_template from public.memberships where workspace_id=$1 and user_id=$2',[workspace,outsider])).rights_template).toBe('lesen');
    expect(await rows("update public.projects set name='Nein' where id=$1 returning name",[project])).toEqual([]);
    expect(await rows('select * from public.time_entries')).toEqual([]);
    // Bisherige Rollen: manager = Leitung (alles außer Team verwalten), member = Mitarbeit.
    await login(manager);
    expect((await first<{r:Record<string,string>}>('select private.rights($1) as r',[workspace])).r).toMatchObject({ finance:'edit', time_team:'edit', team:'view', settings:'edit' });
    await login(member);
    expect((await first<{r:Record<string,string>}>('select private.rights($1) as r',[workspace])).r).toMatchObject({ projects:'view', tasks:'edit', finance:'none', team:'none' });
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
  it('keeps a disabled membership disabled and blocks reinvitation until the owner explicitly restores it', async () => {
    await login(owner);
    await db.query("select public.set_member_role($1,$2,'disabled')",[workspace,member]);
    await expect(attempt("select public.invite_member($1,'member@example.org','manager')",[workspace])).rejects.toThrow(/Mitglied/);
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
  it('manages weekly capacity via the definer function and absences under RLS', async () => {
    await expect(attempt('select * from public.set_member_capacity($1,$2,2400)',[workspace,member])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    expect((await first<{weekly_capacity_minutes:number}>('select * from public.set_member_capacity($1,$2,2400)',[workspace,member])).weekly_capacity_minutes).toBe(2400);
    await expect(attempt('select * from public.set_member_capacity($1,$2,6060)',[workspace,member])).rejects.toThrow(/100 Stunden/);
    expect((await first<{weekly_capacity_minutes:number|null}>('select * from public.set_member_capacity($1,$2,null)',[workspace,member])).weekly_capacity_minutes).toBeNull();
    await login(member);
    const own=await first<{id:string}>("insert into public.absences(workspace_id,starts_on,ends_on,kind,note) values($1,'2026-12-21','2026-12-31','vacation','Skiurlaub') returning id",[workspace]);
    await expect(attempt("insert into public.absences(workspace_id,user_id,starts_on,ends_on) values($1,$2,'2026-12-21','2026-12-22')",[workspace,manager])).rejects.toThrow();
    await expect(attempt("insert into public.absences(workspace_id,starts_on,ends_on) values($1,'2026-12-22','2026-12-21')",[workspace])).rejects.toThrow();
    await login(manager);
    await db.query("insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind) values($1,$2,'2026-11-02','2026-11-02','sick')",[workspace,member]);
    expect(await rows('select * from public.absences where workspace_id=$1 order by starts_on',[workspace])).toHaveLength(2);
    expect(await rows('delete from public.absences where id=$1 returning id',[own.id])).toHaveLength(1);
    await login(outsider);
    expect(await rows('select * from public.absences where workspace_id=$1',[workspace])).toHaveLength(0);
  });
  it('stores holiday locations: managers for anyone, members only for themselves, owners/managers for the workspace default', async () => {
    await login(member);
    expect((await first<{location:string}>("select * from public.set_member_location($1,$2,'DE-BW')",[workspace,member])).location).toBe('DE-BW');
    await expect(attempt("select * from public.set_member_location($1,$2,'DE-BW')",[workspace,manager])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select * from public.set_member_location($1,$2,'de-bw')",[workspace,member])).rejects.toThrow(/LAND-REGION/);
    await expect(attempt("select * from public.set_workspace_location($1,'DE-BW')",[workspace])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    expect((await first<{location:string}>("select * from public.set_member_location($1,$2,'AT-9')",[workspace,member])).location).toBe('AT-9');
    expect((await first<{location:string|null}>("select * from public.set_member_location($1,$2,'')",[workspace,member])).location).toBeNull();
    expect((await first<{default_location:string}>("select * from public.set_workspace_location($1,'CH-ZH')",[workspace])).default_location).toBe('CH-ZH');
    expect((await first<{default_location:string|null}>("select * from public.set_workspace_location($1,null)",[workspace])).default_location).toBeNull();
    await login(outsider);
    await expect(attempt("select * from public.set_member_location($1,$2,'DE-BW')",[workspace,member])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("select * from public.set_member_location($1,$2,'DE-BW')",[workspace,outsider])).rejects.toThrow(/Berechtigung/);
  });
  it('runs vacation requests through approval, notifies, protects decided absences and keeps entitlements with the management', async () => {
    await login(member);
    const req=await first<{id:string;status:string;decided_by:string|null}>("insert into public.absences(workspace_id,starts_on,ends_on,kind,note) values($1,'2027-02-01','2027-02-05','vacation','Ski') returning *",[workspace]);
    expect(req.status).toBe('requested');expect(req.decided_by).toBeNull();
    const sick=await first<{status:string}>("insert into public.absences(workspace_id,starts_on,ends_on,kind) values($1,'2027-02-08','2027-02-08','sick') returning *",[workspace]);
    expect(sick.status).toBe('approved');
    await expect(attempt("insert into public.absences(workspace_id,starts_on,ends_on,kind,half_day) values($1,'2027-03-01','2027-03-02','vacation','am')",[workspace])).rejects.toThrow();
    expect((await first<{half_day:string}>("insert into public.absences(workspace_id,starts_on,ends_on,kind,half_day) values($1,'2027-03-01','2027-03-01','vacation','pm') returning *",[workspace])).half_day).toBe('pm');
    // Ein Mitglied kann sich nicht selbst genehmigen – der Trigger setzt den Status zurück.
    expect((await first<{status:string}>("update public.absences set status='approved' where id=$1 returning status",[req.id])).status).toBe('requested');
    await login(manager);
    expect((await first<{entry_count:number}>("select entry_count from public.notifications where user_id=$1 and kind='absence_requested' and read_at is null",[manager])).entry_count).toBe(2);
    const decided=await first<{status:string;decided_by:string}>("update public.absences set status='approved' where id=$1 returning *",[req.id]);
    expect(decided.status).toBe('approved');expect(decided.decided_by).toBe(manager);
    await login(member);
    expect(await rows("select kind from public.notifications where user_id=$1 and kind='absence_approved' and read_at is null",[member])).toHaveLength(1);
    await expect(attempt("update public.absences set ends_on='2027-02-10' where id=$1",[req.id])).rejects.toThrow(/Leitung/);
    expect(await rows('delete from public.absences where id=$1 returning id',[req.id])).toHaveLength(0); // genehmigt: nur die Leitung löscht
    await expect(attempt('select * from public.set_vacation_entitlement($1,$2,30)',[workspace,member])).rejects.toThrow(/Berechtigung/);
    await expect(attempt("insert into public.vacation_balances(workspace_id,user_id,year,carried_over) values($1,$2,2027,3)",[workspace,member])).rejects.toThrow();
    await login(manager);
    expect((await first<{vacation_days_per_year:string}>('select * from public.set_vacation_entitlement($1,$2,27.5)',[workspace,member])).vacation_days_per_year).toBe('27.5');
    await expect(attempt('select * from public.set_vacation_entitlement($1,$2,101)',[workspace,member])).rejects.toThrow(/100 Tagen/);
    expect((await first<{carried_over:string}>("insert into public.vacation_balances(workspace_id,user_id,year,carried_over,adjustment) values($1,$2,2027,3,-1) returning *",[workspace,member])).carried_over).toBe('3.0');
    expect((await first<{absence_approval:boolean}>('select * from public.set_absence_approval($1,false)',[workspace])).absence_approval).toBe(false);
    await login(member);
    expect((await first<{status:string}>("insert into public.absences(workspace_id,starts_on,ends_on,kind) values($1,'2027-04-01','2027-04-02','vacation') returning *",[workspace])).status).toBe('approved');
    expect(await rows('select * from public.vacation_balances where workspace_id=$1',[workspace])).toHaveLength(1);
    await login(manager);
    expect((await first<{absence_approval:boolean}>('select * from public.set_absence_approval($1,true)',[workspace])).absence_approval).toBe(true);
  });
  it('stores work schedules with the management, keeps weekly capacity as the sum and validates the model', async () => {
    await login(member);
    await expect(attempt("select * from public.set_work_schedule($1,$2,'[480,480,480,480,0,0,0]'::jsonb,'2026-10-05',120)",[workspace,member])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    const row=await first<{work_schedule:number[];weekly_capacity_minutes:number;balance_start_on:string|Date;balance_start_minutes:number}>("select * from public.set_work_schedule($1,$2,'[480,480,480,480,0,0,0]'::jsonb,'2026-10-05',120)",[workspace,member]);
    expect(row.work_schedule).toEqual([480,480,480,480,0,0,0]);expect(row.weekly_capacity_minutes).toBe(1920);expect(new Date(row.balance_start_on).toISOString().slice(0,10)).toBe('2026-10-05');expect(row.balance_start_minutes).toBe(120);
    await expect(attempt("select * from public.set_work_schedule($1,$2,'[480,480,480]'::jsonb,null,0)",[workspace,member])).rejects.toThrow(/sieben/);
    await expect(attempt("select * from public.set_work_schedule($1,$2,'[1441,0,0,0,0,0,0]'::jsonb,null,0)",[workspace,member])).rejects.toThrow();
    await expect(attempt("select * from public.set_work_schedule($1,$2,'[1440,1440,1440,1440,1440,0,0]'::jsonb,null,0)",[workspace,member])).rejects.toThrow(/100 Stunden/);
    const cleared=await first<{work_schedule:null;weekly_capacity_minutes:number}>("select * from public.set_work_schedule($1,$2,null,null,null)",[workspace,member]);
    expect(cleared.work_schedule).toBeNull();expect(cleared.weekly_capacity_minutes).toBe(1920);
  });
  it('sums booked minutes per task through the invoker-rights view', async () => {
    await login(manager);
    const task=(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Effort') returning id",[workspace,project])).id;
    await login(member);
    await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable,task_id) values($1,$2,'2026-10-13',90,'a',true,$3),($1,$2,'2026-10-14',30,'b',true,$3)",[workspace,project,task]);
    await login(manager);
    await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable,task_id) values($1,$2,'2026-10-14',60,'c',true,$3)",[workspace,project,task]);
    expect(await rows('select task_id,minutes,entries from public.task_effort where workspace_id=$1 and task_id=$2',[workspace,task])).toEqual([{task_id:task,minutes:180,entries:3}]);
    await login(member);
    expect(await rows('select minutes from public.task_effort where task_id=$1',[task])).toEqual([{minutes:120}]); // nur eigene Zeiten
    await login(outsider);
    expect(await rows('select minutes from public.task_effort where task_id=$1',[task])).toEqual([]);
  });
  it('sums booked minutes per project through the invoker-rights view', async () => {
    await login(member);
    await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable) values($1,$2,'2026-10-13',90,'a',true),($1,$2,'2026-10-15',30,'b',true)",[workspace,project]);
    await login(manager);
    await db.query("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable) values($1,$2,'2026-10-14',60,'c',true)",[workspace,project]);
    const [row]=await rows<{minutes:number;entries:number;first_work_date:Date|string;last_work_date:Date|string}>('select minutes,entries,first_work_date,last_work_date from public.project_effort where workspace_id=$1 and project_id=$2',[workspace,project]);
    expect(row.minutes).toBe(180);expect(row.entries).toBe(3);expect(new Date(row.first_work_date).toISOString().slice(0,10)).toBe('2026-10-13');expect(new Date(row.last_work_date).toISOString().slice(0,10)).toBe('2026-10-15');
    await login(member);
    expect((await rows<{minutes:number}>('select minutes from public.project_effort where project_id=$1',[project]))[0].minutes).toBe(120);
    await login(outsider);
    expect(await rows('select minutes from public.project_effort where project_id=$1',[project])).toEqual([]);
  });
  it('tracks the task lifecycle in the trigger and lets only the management rate', async () => {
    await login(manager);
    const t=await first<{id:string;started_at:string|null;done_at:string|null;reopened_count:number;tags:string[]}>("insert into public.tasks(workspace_id,project_id,title,tags) values($1,$2,'Lifecycle','{motion,3d}') returning *",[workspace,project]);
    expect(t.started_at).toBeNull();expect(t.done_at).toBeNull();expect(t.tags).toEqual(['motion','3d']);
    await expect(attempt("insert into public.tasks(workspace_id,project_id,title,tags) values($1,$2,'Bad','{Motion}')",[workspace,project])).rejects.toThrow();
    const doing=await first<{started_at:string|null;done_at:string|null}>("update public.tasks set status='doing' where id=$1 returning *",[t.id]);
    expect(doing.started_at).not.toBeNull();expect(doing.done_at).toBeNull();
    const done=await first<{done_at:string|null;reopened_count:number}>("update public.tasks set status='done', rating=4 where id=$1 returning *",[t.id]);
    expect(done.done_at).not.toBeNull();expect(done.reopened_count).toBe(0);
    const reopened=await first<{done_at:string|null;reopened_count:number;rating:number}>("update public.tasks set status='doing' where id=$1 returning *",[t.id]);
    expect(reopened.done_at).toBeNull();expect(reopened.reopened_count).toBe(1);expect(reopened.rating).toBe(4);
    // Zeitstempel und Zähler lassen sich nicht vom Client setzen.
    expect((await first<{reopened_count:number}>("update public.tasks set reopened_count=99, done_at=now() where id=$1 returning *",[t.id])).reopened_count).toBe(1);
    await login(member);
    await expect(attempt("update public.tasks set rating=1 where id=$1",[t.id])).rejects.toThrow(/Leitung/);
    expect((await first<{status:string;rating:number}>("update public.tasks set status='done' where id=$1 returning *",[t.id])).rating).toBe(4);
    await expect(attempt("update public.tasks set rating=6 where id=$1",[t.id])).rejects.toThrow();
  });
  it('keeps time suggestions private to their owner, deduplicates by external id and books drafts only on acceptance', async () => {
    await login(member);
    const s=await first<{id:string;status:string;user_id:string}>("insert into public.time_suggestions(workspace_id,source,external_id,project_id,work_date,minutes,note,confidence,evidence) values($1,'chatgpt','cal-1',$2,'2026-10-13',90,'Jour fixe',0.8,'[{\"title\":\"Kalender\"}]') returning *",[workspace,project]);
    expect(s.status).toBe('pending');expect(s.user_id).toBe(member);
    await expect(attempt("insert into public.time_suggestions(workspace_id,source,external_id,project_id,work_date,minutes,note) values($1,'chatgpt','cal-1',$2,'2026-10-13',90,'Doppelt')",[workspace,project])).rejects.toThrow();
    await expect(attempt("insert into public.time_suggestions(workspace_id,user_id,project_id,work_date,minutes,note) values($1,$2,$3,'2026-10-13',30,'Fremd')",[workspace,manager,project])).rejects.toThrow();
    await login(manager);
    expect(await rows('select id from public.time_suggestions where workspace_id=$1',[workspace])).toEqual([]); // Leitung sieht fremde Vorschläge nicht
    await expect(attempt("select * from public.accept_time_suggestion($1,$2,null,'2026-10-13',60,'x',true)",[s.id,project])).rejects.toThrow(/nicht gefunden/);
    await login(member);
    const entry=await first<{id:string;minutes:number;status:string;note:string;user_id:string}>("select * from public.accept_time_suggestion($1,$2,null,'2026-10-13',75,'Jour fixe Museum',true)",[s.id,project]);
    expect(entry).toMatchObject({minutes:75,status:'draft',note:'Jour fixe Museum',user_id:member});
    expect(await first<{status:string;entry_id:string;minutes:number}>('select status,entry_id,minutes from public.time_suggestions where id=$1',[s.id])).toEqual({status:'accepted',entry_id:entry.id,minutes:75});
    await expect(attempt("select * from public.accept_time_suggestion($1,$2,null,'2026-10-13',60,'x',true)",[s.id,project])).rejects.toThrow(/schon entschieden/);
    const d=await first<{id:string}>("insert into public.time_suggestions(workspace_id,project_id,work_date,minutes,note) values($1,$2,'2026-10-14',30,'Verwerfen') returning id",[workspace,project]);
    expect((await first<{status:string}>("update public.time_suggestions set status='dismissed' where id=$1 returning status",[d.id])).status).toBe('dismissed');
    await login(outsider);
    expect(await rows('select id from public.time_suggestions where workspace_id=$1',[workspace])).toEqual([]);
  });
  it('books time on tasks of the same project, keeps approved time when the task is deleted, and timers carry the task', async () => {
    await login(manager);
    const task=(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Design') returning id",[workspace,project])).id;
    const otherProject=(await first<{id:string}>("insert into public.projects(workspace_id,code,name) values($1,'B','B') returning id",[workspace])).id;
    await login(member);
    const e=await first<{id:string}>("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable,task_id) values($1,$2,'2026-10-13',60,'Arbeit',true,$3) returning id",[workspace,project,task]);
    await expect(attempt("insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable,task_id) values($1,$2,'2026-10-13',30,'Falsch',true,$3)",[workspace,otherProject,task])).rejects.toThrow(/gehört nicht/);
    await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await login(manager); await db.query('select public.review_entry($1,true)',[e.id]);
    const tt=await first<{id:string}>('select * from public.start_timer($1,$2,$3,$4,$5)',[workspace,project,'Mit Aufgabe',true,task]);
    await ageTimer(tt.id,'125 seconds'); await login(manager);
    const stopped=await rows<{task_id:string|null}>('select * from public.stop_timer($1)',[tt.id]);
    expect(stopped[0]!.task_id).toBe(task);
    expect(await rows('delete from public.tasks where id=$1 returning id',[task])).toHaveLength(1);
    const after=await first<{task_id:string|null;status:string}>('select task_id,status from public.time_entries where id=$1',[e.id]);
    expect(after.task_id).toBeNull(); expect(after.status).toBe('approved');
    await login(member);
    await expect(attempt('select * from public.start_timer($1,$2,$3,$4,$5)',[workspace,otherProject,'Falsch',true,(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title) values($1,$2,'Neu') returning id",[workspace,project])).id])).rejects.toThrow(/gehört nicht/);
  });
  it('rolls repeating tasks forward on completion without duplicating on status toggles', async () => {
    await login(manager);
    const id=(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title,due_date,repeat,assignee_id,estimated_minutes) values($1,$2,'Wochenreport','2026-10-16','weekly',$3,120) returning id",[workspace,project,member])).id;
    await db.query("update public.tasks set status='done' where id=$1",[id]);
    expect((await first<{repeat:string}>('select repeat from public.tasks where id=$1',[id])).repeat).toBe('');
    const next=await first<{due:string|null;status:string;repeat:string;assignee_id:string;estimated_minutes:number;created_by:string}>("select due_date::text as due,status,repeat,assignee_id,estimated_minutes,created_by from public.tasks where workspace_id=$1 and title='Wochenreport' and id<>$2",[workspace,id]);
    expect(next).toMatchObject({due:'2026-10-23',status:'todo',repeat:'weekly',assignee_id:member,estimated_minutes:120,created_by:manager});
    await db.query("update public.tasks set status='todo' where id=$1",[id]);
    await db.query("update public.tasks set status='done' where id=$1",[id]);
    expect(await rows("select id from public.tasks where workspace_id=$1 and title='Wochenreport'",[workspace])).toHaveLength(2);
    const monthly=(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title,repeat) values($1,$2,'Monatsabschluss','monthly') returning id",[workspace,project])).id;
    await db.query("update public.tasks set status='done' where id=$1",[monthly]);
    expect((await first<{due:string|null}>("select due_date::text as due from public.tasks where title='Monatsabschluss' and id<>$1",[monthly])).due).toBeNull();
    const capped=(await first<{id:string}>("insert into public.tasks(workspace_id,project_id,title,due_date,repeat) values($1,$2,'Jahrhundertwende','2100-12-20','monthly') returning id",[workspace,project])).id;
    await db.query("update public.tasks set status='done' where id=$1",[capped]);
    expect((await first<{due:string}>("select due_date::text as due from public.tasks where title='Jahrhundertwende' and id<>$1",[capped])).due).toBe('2100-12-31');
    await expect(attempt("insert into public.tasks(workspace_id,project_id,title,repeat) values($1,$2,'Kaputt','daily')",[workspace,project])).rejects.toThrow();
    await login(member);
  });
  it('approves a submitted batch in one call, skipping entries decided in the meantime', async () => {
    const a=await entry(60); const b=await entry(30); const c=await entry(45);
    await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await login(manager);
    await db.query('select public.review_entry($1,false)',[c.id]);
    await expect(attempt('select public.review_entries($1,$2,null)',[workspace,[a.id,b.id]])).rejects.toThrow(/Freigabe-Entscheidung/);
    expect((await first('select public.review_entries($1,$2,true) as n',[workspace,[a.id,b.id,c.id]])).n).toBe(2);
    expect((await rows('select status from public.time_entries where id=any($1::uuid[])',[[a.id,b.id]])).map(r=>r.status)).toEqual(['approved','approved']);
    expect((await first('select status from public.time_entries where id=$1',[c.id])).status).toBe('draft');
    await login(member); await expect(attempt('select public.review_entries($1,$2,false)',[workspace,[a.id]])).rejects.toThrow(/Berechtigung/);
    await login(outsider); await expect(attempt('select public.review_entries($1,$2,true)',[workspace,[a.id]])).rejects.toThrow(/Berechtigung/);
  });
  it('lets owners rename the workspace and everyone curate only their own display name', async () => {
    await login(owner);
    const w=await first<{name:string}>("select * from public.rename_workspace($1,'  Studio Süd  ')",[workspace]);
    expect(w.name).toBe('Studio Süd');
    await expect(attempt("select public.rename_workspace($1,'')",[workspace])).rejects.toThrow(/1 bis 100/);
    await expect(attempt('select public.rename_workspace($1,$2)',[workspace,'x'.repeat(101)])).rejects.toThrow(/1 bis 100/);
    await login(manager); await expect(attempt("select public.rename_workspace($1,'Fremd')",[workspace])).rejects.toThrow(/Berechtigung/);
    await login(outsider); await expect(attempt("select public.rename_workspace($1,'Fremd')",[workspace])).rejects.toThrow(/Berechtigung/);
    await login(member);
    const m=await first<{display_name:string;user_id:string}>("select * from public.set_display_name($1,'  Mira M.  ')",[workspace]);
    expect(m.display_name).toBe('Mira M.'); expect(m.user_id).toBe(member);
    await expect(attempt("select public.set_display_name($1,'')",[workspace])).rejects.toThrow(/1 bis 120/);
    await expect(attempt("update public.memberships set display_name='Direkt' where user_id=$1",[member])).rejects.toThrow();
    await login(outsider); await expect(attempt("select public.set_display_name($1,'Eindringling')",[workspace])).rejects.toThrow(/Berechtigung/);
    await login(manager);
    expect((await first<{display_name:string}>('select display_name from public.memberships where workspace_id=$1 and user_id=$2',[workspace,member])).display_name).toBe('Mira M.');
    await login(owner); await db.query("select public.rename_workspace($1,'Studio')",[workspace]); await login(member);
  });
  it('notifies entry owners about review decisions, merges unread counts, and keeps notifications private', async () => {
    const a=await entry(60); const b=await entry(30); const c=await entry(45);
    await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await login(manager);
    await db.query('select public.review_entry($1,true)',[a.id]);
    expect((await first('select public.review_entries($1,$2,false) as n',[workspace,[b.id,c.id]])).n).toBe(2);
    expect(await rows('select * from public.notifications')).toHaveLength(0); // RLS: nur eigene Zeilen
    await login(member);
    expect(await rows<{kind:string;entry_count:number}>('select kind,entry_count from public.notifications where read_at is null order by kind')).toEqual([{kind:'entries_approved',entry_count:1},{kind:'entries_returned',entry_count:2}]);
    await expect(attempt("insert into public.notifications(workspace_id,user_id,kind) values($1,$2,'entries_approved')",[workspace,member])).rejects.toThrow();
    await expect(attempt('update public.notifications set read_at=now()')).rejects.toThrow();
    expect((await first('select public.mark_notifications_read($1) as n',[workspace])).n).toBe(2);
    expect(await rows('select * from public.notifications where read_at is null')).toHaveLength(0);
    await login(manager);
    await db.query('select public.revoke_approval($1)',[a.id]);
    const own=await entry(15);
    await db.query("select public.submit_entries($1,'2026-10-13','2026-10-13')",[workspace]);
    await db.query('select public.review_entry($1,true)',[own.id]);
    expect(await rows('select * from public.notifications')).toHaveLength(0); // Selbst-Review meldet nichts
    await login(member);
    expect(await rows('select kind,entry_count from public.notifications where read_at is null')).toEqual([{kind:'entries_returned',entry_count:1}]);
  });
  it('manages invitations: managers list, owners revoke, conflicts and expiry cleanup', async () => {
    await login(owner); await db.query("select public.invite_member($1,'new@example.org','member')",[workspace]);
    await login(member); await expect(attempt('select * from public.list_invitations($1)',[workspace])).rejects.toThrow(/Berechtigung/);
    await login(manager); const inv=(await rows<{id:string;email:string}>('select * from public.list_invitations($1)',[workspace]))[0]!;
    expect(inv.email).toBe('new@example.org');
    await expect(attempt('select public.revoke_invitation($1)',[inv.id])).rejects.toThrow(/Berechtigung/);
    await login(outsider); await expect(attempt('select * from public.list_invitations($1)',[workspace])).rejects.toThrow(/Berechtigung/);
    await login(owner); await db.query('select public.revoke_invitation($1)',[inv.id]);
    expect(await rows('select * from public.list_invitations($1)',[workspace])).toEqual([]);
    await expect(attempt("select public.invite_member($1,'member@example.org','manager')",[workspace])).rejects.toThrow(/Mitglied/);
    await db.query("select public.invite_member($1,'stale@example.org','member')",[workspace]);
    await db.exec('reset role');
    await db.query("update public.invitations set expires_at=now()-interval '1 day' where email='stale@example.org'");
    await login(owner); await db.query("select public.invite_member($1,'fresh@example.org','member')",[workspace]);
    await db.exec('reset role');
    expect(await rows("select email from public.invitations where workspace_id=$1 order by email",[workspace])).toEqual([{email:'fresh@example.org'}]);
    await login(member);
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
