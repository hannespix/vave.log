-- VAVE.LOG: tenant isolation, reviewed timesheets and atomic timers.
-- auth.users/auth.uid() and the authenticated/anon roles are supplied by Supabase.
-- No runtime service-role credential is required. All identity comes from auth.uid().
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  timezone text not null default 'Europe/Berlin',
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','manager','member','disabled')),
  display_name text not null default '' check (length(display_name) <= 120),
  email text not null check (length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index memberships_user_workspace on public.memberships(user_id,workspace_id);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  role text not null check (role in ('manager','member')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '14 days',
  unique(workspace_id,email)
);
create index invitations_email on public.invitations(email);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  code text not null check (length(btrim(code)) between 1 and 24),
  name text not null check (length(btrim(name)) between 1 and 160),
  client text not null default '' check (length(client)<=160),
  budget_minutes integer not null default 0 check (budget_minutes between 0 and 52560000),
  status text not null default 'active' check (status in ('active','paused','archived')),
  color text not null default '#641dff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,code)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  assignee_id uuid,
  due_date date check (due_date is null or due_date between date '2000-01-01' and date '2100-12-31'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id),
  foreign key (workspace_id,assignee_id) references public.memberships(workspace_id,user_id)
);
create index tasks_workspace_project on public.tasks(workspace_id,project_id);
create index tasks_workspace_assignee on public.tasks(workspace_id,assignee_id);
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  user_id uuid not null default auth.uid(),
  work_date date not null check (work_date between date '2000-01-01' and date '2100-12-31'),
  minutes integer not null check (minutes between 1 and 1440),
  note text not null default '' check (length(note)<=4000),
  billable boolean not null default true,
  status text not null default 'draft' check (status in ('draft','submitted','approved')),
  timer_id uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id),
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id),
  unique (timer_id,work_date)
);
create index time_entries_workspace_date_user on public.time_entries(workspace_id,work_date,user_id);
create index time_entries_user_date on public.time_entries(user_id,work_date);
create index time_entries_workspace_project on public.time_entries(workspace_id,project_id);
create table public.running_timers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  user_id uuid not null unique default auth.uid(),
  started_at timestamptz not null default clock_timestamp(),
  note text not null default '' check (length(note)<=4000),
  billable boolean not null default true,
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id),
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id)
);
create index running_timers_workspace_project on public.running_timers(workspace_id,project_id);
create index running_timers_workspace_user on public.running_timers(workspace_id,user_id);
-- Immutable stop receipts retain the exact original response even after a draft
-- is subsequently edited/deleted. This table is inaccessible through the Data API.
create table private.timer_receipts (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  entries jsonb not null,
  stopped_at timestamptz not null default now()
);
create index timer_receipts_user on private.timer_receipts(user_id);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_workspace_created on public.audit_log(workspace_id,created_at);

-- Private helpers have a pinned search_path and explicit execute grants. Helpers
-- never authorize via user-editable user_metadata or a caller-controlled flag.
create function private.current_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid())
    and m.role in ('owner','manager','member')
$$;
create function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null or not exists(select 1 from auth.users where id=v_id and email_confirmed_at is not null) then
    raise exception 'Eine bestätigte E-Mail und Anmeldung sind erforderlich.' using errcode='42501';
  end if;
  return v_id;
end $$;
create function private.require_role(p_workspace_id uuid,p_roles text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not coalesce(private.current_role(p_workspace_id)=any(p_roles),false) then
    raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501';
  end if;
end $$;
create function private.lock_user(p_user_id uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vave-time:'||p_user_id::text,0))
$$;
create function private.audit(p_workspace_id uuid,p_action text,p_type text,p_id uuid,p_details jsonb default '{}'::jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  values(p_workspace_id,auth.uid(),p_action,p_type,p_id,p_details)
$$;

-- RLS reads are membership based, including workspaces created by a former owner.
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.running_timers enable row level security;
alter table public.audit_log enable row level security;
alter table private.timer_receipts enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(private.current_role(id) is not null);
create policy membership_read on public.memberships for select to authenticated using(private.current_role(workspace_id) is not null);
create policy invitation_read on public.invitations for select to authenticated using(private.current_role(workspace_id)='owner');
create policy project_read on public.projects for select to authenticated using(private.current_role(workspace_id) is not null);
create policy project_insert on public.projects for insert to authenticated with check(private.current_role(workspace_id) in ('owner','manager'));
create policy project_update on public.projects for update to authenticated using(private.current_role(workspace_id) in ('owner','manager')) with check(private.current_role(workspace_id) in ('owner','manager'));
create policy task_read on public.tasks for select to authenticated using(private.current_role(workspace_id) is not null);
create policy task_insert on public.tasks for insert to authenticated with check(private.current_role(workspace_id) is not null and created_by=(select auth.uid()));
create policy task_update on public.tasks for update to authenticated using(private.current_role(workspace_id) is not null) with check(private.current_role(workspace_id) is not null);
create policy task_delete on public.tasks for delete to authenticated using(private.current_role(workspace_id) is not null);
create policy entry_read on public.time_entries for select to authenticated using(private.current_role(workspace_id) in ('owner','manager') or (private.current_role(workspace_id)='member' and user_id=(select auth.uid())));
create policy entry_insert on public.time_entries for insert to authenticated with check(private.current_role(workspace_id) is not null and user_id=(select auth.uid()) and status='draft' and timer_id is null);
create policy entry_update on public.time_entries for update to authenticated using(private.current_role(workspace_id) is not null and user_id=(select auth.uid()) and status='draft') with check(private.current_role(workspace_id) is not null and user_id=(select auth.uid()) and status='draft');
create policy entry_delete on public.time_entries for delete to authenticated using(private.current_role(workspace_id) is not null and user_id=(select auth.uid()) and status='draft');
create policy timer_read on public.running_timers for select to authenticated using(user_id=(select auth.uid()) and private.current_role(workspace_id) is not null);
create policy audit_read on public.audit_log for select to authenticated using(private.current_role(workspace_id) in ('owner','manager'));

-- Direct writes receive only the necessary grants, independent of Supabase's
-- installation-specific default privileges. Privileged state has no write grant.
revoke all on public.workspaces,public.memberships,public.invitations,public.projects,public.tasks,public.time_entries,public.running_timers,public.audit_log from public,anon,authenticated;
revoke all on private.timer_receipts from public,anon,authenticated;
grant select on public.workspaces,public.memberships,public.invitations,public.projects,public.tasks,public.time_entries,public.running_timers,public.audit_log to authenticated;
grant insert,update on public.projects to authenticated;
grant insert,update,delete on public.tasks,public.time_entries to authenticated;

create function private.guard_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Ungültige IANA-Zeitzone.';
  end if;
  return new;
end $$;
create trigger workspace_guard before insert or update on public.workspaces for each row execute function private.guard_workspace();
create function private.guard_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.created_at is distinct from old.created_at then
    raise exception 'ID, Workspace und Erstellungsdatum sind unveränderlich.';
  end if;
  if tg_table_name='tasks' and (to_jsonb(new)->'created_by') is distinct from (to_jsonb(old)->'created_by') then
    raise exception 'Der Ersteller ist unveränderlich.';
  end if;
  return new;
end $$;
create trigger project_identity before update on public.projects for each row execute function private.guard_identity();
create trigger task_identity before update on public.tasks for each row execute function private.guard_identity();
create function private.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id) then
    raise exception 'Mitgliedschaft ist unveränderlich.';
  end if;
  if old.role='owner' and (tg_op='DELETE' or new.role<>'owner') then
    perform 1 from public.workspaces where id=old.workspace_id for update;
    if not exists(select 1 from public.memberships where workspace_id=old.workspace_id and role='owner' and user_id<>old.user_id) then
      raise exception 'Der letzte Owner kann nicht entfernt oder herabgestuft werden.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger membership_owner_guard before update or delete on public.memberships for each row execute function private.guard_last_owner();

create function private.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' or old.user_id is distinct from auth.uid() then raise exception 'Nur eigene Entwürfe können gelöscht werden.'; end if;
    perform private.lock_user(old.user_id);
    if private.current_role(old.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.user_id is distinct from auth.uid() or new.status<>'draft' then raise exception 'Nur eigene Entwürfe können erstellt werden.'; end if;
    if current_user in ('anon','authenticated') and new.timer_id is not null then raise exception 'Timer-Zuordnung ist geschützt.'; end if;
  else
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.timer_id is distinct from old.timer_id or new.created_at is distinct from old.created_at then
      raise exception 'Identität und Timer-Zuordnung sind unveränderlich.';
    end if;
    if new.status is distinct from old.status then
      if current_user in ('anon','authenticated') then raise exception 'Statuswechsel erfordern die Freigabe-Funktion.'; end if;
      if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Ein Statuswechsel darf den Inhalt nicht verändern.'; end if;
      if old.status='draft' and new.status='submitted' and old.user_id=auth.uid() then null;
      elsif old.status='submitted' and new.status in ('draft','approved') and private.current_role(old.workspace_id) in ('owner','manager') then null;
      else raise exception 'Ungültiger Statuswechsel.'; end if;
    elsif old.status<>'draft' or old.user_id is distinct from auth.uid() then
      raise exception 'Nur eigene Entwürfe können geändert werden.';
    end if;
  end if;
  perform private.lock_user(new.user_id);
  -- Recheck after waiting: a concurrent owner may have disabled this actor.
  if private.current_role(new.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  if new.minutes + coalesce((select sum(minutes) from public.time_entries where user_id=new.user_id and workspace_id=new.workspace_id and work_date=new.work_date and id<>new.id),0)>1440 then
    raise exception 'Pro Tag und Workspace sind höchstens 1440 Minuten erlaubt.';
  end if;
  return new;
end $$;
-- Direct updates normally acquire a row lock before their row trigger runs.
-- Take the actor's user lock at statement start so direct writes use the same
-- user -> entry-row order as RPCs. RPCs already lock the affected user and skip
-- this trigger's lock; managers reviewing others must not also lock the actor.
create function private.lock_direct_entries() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then perform private.lock_user(auth.uid()); end if;
  return null;
end $$;
create trigger entry_statement_lock before insert or update or delete on public.time_entries for each statement execute function private.lock_direct_entries();
create trigger entry_guard before insert or update or delete on public.time_entries for each row execute function private.guard_entry();

create function public.create_workspace(p_name text,p_timezone text,p_currency text) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_workspace public.workspaces; v_email text; v_name text;
begin
  select email,left(coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1)),120) into v_email,v_name from auth.users where id=v_user;
  insert into public.workspaces(name,timezone,currency,created_by) values(btrim(p_name),p_timezone,upper(p_currency),v_user) returning * into v_workspace;
  insert into public.memberships(workspace_id,user_id,role,display_name,email) values(v_workspace.id,v_user,'owner',v_name,v_email);
  perform private.audit(v_workspace.id,'create','workspace',v_workspace.id);
  return v_workspace;
end $$;
create function public.invite_member(p_workspace_id uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform private.require_role(p_workspace_id,array['owner']);
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Ungültige E-Mail-Adresse.'; end if;
  if p_role is null or p_role not in ('manager','member') then raise exception 'Ungültige Rolle: Einladungen erlauben nur Manager oder Mitglied.'; end if;
  insert into public.invitations(workspace_id,email,role,invited_by) values(p_workspace_id,v_email,p_role,auth.uid())
  on conflict(workspace_id,email) do update set role=excluded.role,invited_by=excluded.invited_by,created_at=now(),expires_at=now()+interval '14 days'
  returning id into v_id;
  perform private.audit(p_workspace_id,'invite','invitation',v_id,jsonb_build_object('role',p_role));
end $$;
create function public.accept_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_email text; v_name text; v_inv public.invitations; v_count integer:=0; v_added integer;
begin
  select lower(email),left(coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1)),120) into v_email,v_name from auth.users where id=v_user and email_confirmed_at is not null;
  for v_inv in select * from public.invitations where email=v_email and expires_at>now() order by workspace_id for update loop
    insert into public.memberships(workspace_id,user_id,role,display_name,email) values(v_inv.workspace_id,v_user,v_inv.role,v_name,v_email) on conflict(workspace_id,user_id) do nothing;
    get diagnostics v_added = row_count;
    v_count:=v_count+v_added;
    delete from public.invitations where id=v_inv.id;
    perform private.audit(v_inv.workspace_id,'accept','invitation',v_inv.id);
  end loop;
  return v_count;
end $$;
create function public.set_member_role(p_workspace_id uuid,p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_timer public.running_timers;
begin
  perform private.require_role(p_workspace_id,array['owner']);
  if p_role is null or p_role not in ('owner','manager','member','disabled') then raise exception 'Ungültige Rolle.'; end if;
  -- Always user -> workspace. Timer start/stop use the same user lock, so a
  -- disable cannot leave a racing, invisible timer. Workspace locking also
  -- serializes owner demotions, preserving at least one active owner.
  perform private.lock_user(p_user_id);
  perform 1 from public.workspaces where id=p_workspace_id for update;
  perform private.require_role(p_workspace_id,array['owner']);
  update public.memberships set role=p_role where workspace_id=p_workspace_id and user_id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if p_role='disabled' then
    delete from public.running_timers where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_timer;
    if found then perform private.audit(p_workspace_id,'discard_on_disable','timer',v_timer.id); end if;
  end if;
  perform private.audit(p_workspace_id,'role_change','membership',p_user_id,jsonb_build_object('role',p_role));
end $$;
create function public.submit_entries(p_workspace_id uuid,p_from date,p_to date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=private.require_user(); v_entry record; v_count integer:=0;
begin
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  -- Bound date values before subtraction: PostgreSQL supports +/-infinity and
  -- dates beyond JavaScript's range, while the UI/API support years 2000–2100.
  if p_from is null or p_to is null or p_from not between date '2000-01-01' and date '2100-12-31' or p_to not between date '2000-01-01' and date '2100-12-31' then
    raise exception 'Datumsbereich muss zwischen 2000 und 2100 liegen.';
  end if;
  if p_to<p_from or p_to-p_from>365 then raise exception 'Datumsbereich muss zwischen 1 und 366 Tagen liegen.'; end if;
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  for v_entry in update public.time_entries set status='submitted' where workspace_id=p_workspace_id and user_id=v_user and status='draft' and work_date between p_from and p_to returning id loop
    v_count:=v_count+1;
    perform private.audit(p_workspace_id,'submit','time_entry',v_entry.id);
  end loop;
  return v_count;
end $$;
create function public.review_entry(p_id uuid,p_approve boolean) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.time_entries;
begin
  perform private.require_user();
  select * into v_entry from public.time_entries where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Eintrag nicht gefunden.' using errcode='42501'; end if;
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  perform private.lock_user(v_entry.user_id);
  perform private.require_role(v_entry.workspace_id,array['owner','manager']);
  select * into v_entry from public.time_entries where id=p_id for update;
  if not found or v_entry.status<>'submitted' then raise exception 'Nur eingereichte Zeiten können geprüft werden.'; end if;
  if p_approve is null then raise exception 'Freigabe-Entscheidung fehlt.'; end if;
  update public.time_entries set status=case when p_approve then 'approved' else 'draft' end where id=p_id returning * into v_entry;
  perform private.audit(v_entry.workspace_id,case when p_approve then 'approve' else 'return' end,'time_entry',v_entry.id);
  return v_entry;
end $$;
create function public.start_timer(p_workspace_id uuid,p_project_id uuid,p_note text,p_billable boolean) returns public.running_timers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=private.require_user(); v_timer public.running_timers;
begin
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  select * into v_timer from public.running_timers where user_id=v_user for update;
  if found then
    if v_timer.workspace_id=p_workspace_id and v_timer.project_id=p_project_id and v_timer.note=p_note and v_timer.billable=p_billable then return v_timer; end if;
    raise exception 'Es läuft bereits ein Timer. Bitte zuerst stoppen oder verwerfen.';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and workspace_id=p_workspace_id and status='active') then raise exception 'Für Timer ist ein aktives Projekt im Workspace erforderlich.'; end if;
  insert into public.running_timers(workspace_id,project_id,user_id,note,billable) values(p_workspace_id,p_project_id,v_user,p_note,p_billable) returning * into v_timer;
  perform private.audit(p_workspace_id,'start','timer',v_timer.id);
  return v_timer;
end $$;
create function public.stop_timer(p_timer_id uuid) returns setof public.time_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=private.require_user(); v_timer public.running_timers; v_receipt jsonb; v_receipt_workspace uuid;
  v_stop timestamptz:=clock_timestamp(); v_cursor timestamptz; v_boundary timestamptz;
  v_timezone text; v_date date; v_total integer; v_left integer; v_minutes integer;
begin
  perform private.lock_user(v_user);
  select entries,workspace_id into v_receipt,v_receipt_workspace from private.timer_receipts where id=p_timer_id and user_id=v_user;
  if found then
    perform private.require_role(v_receipt_workspace,array['owner','manager','member']);
    return query select * from jsonb_populate_recordset(null::public.time_entries,v_receipt) order by work_date,id;
    return;
  end if;
  select * into v_timer from public.running_timers where id=p_timer_id and user_id=v_user for update;
  if not found then raise exception 'Timer nicht gefunden oder keine Berechtigung.'; end if;
  perform private.require_role(v_timer.workspace_id,array['owner','manager','member']);
  v_stop:=clock_timestamp();
  if v_stop-v_timer.started_at>interval '24 hours' then raise exception 'Timer über 24 Stunden: bitte verwerfen und manuell erfassen.'; end if;
  v_total:=floor(extract(epoch from(v_stop-v_timer.started_at))/60)::integer;
  if v_total<1 then raise exception 'Der Timer muss mindestens eine Minute laufen.'; end if;
  select timezone into v_timezone from public.workspaces where id=v_timer.workspace_id;
  v_cursor:=v_timer.started_at; v_left:=v_total;
  while v_cursor<v_stop loop
    v_date:=(v_cursor at time zone v_timezone)::date;
    v_boundary:=((v_date+1)::timestamp at time zone v_timezone);
    if v_boundary<=v_cursor then raise exception 'Zeitzonengrenze konnte nicht ermittelt werden.'; end if;
    if v_boundary>=v_stop then v_minutes:=v_left;
    else v_minutes:=least(v_left,floor(extract(epoch from(v_boundary-v_cursor))/60)::integer); end if;
    if v_minutes>0 then
      insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,timer_id)
      values(v_timer.workspace_id,v_timer.project_id,v_user,v_date,v_minutes,v_timer.note,v_timer.billable,v_timer.id);
      v_left:=v_left-v_minutes;
    end if;
    v_cursor:=least(v_boundary,v_stop);
  end loop;
  select jsonb_agg(to_jsonb(e) order by work_date,id) into v_receipt from public.time_entries e where timer_id=v_timer.id;
  insert into private.timer_receipts(id,workspace_id,user_id,entries) values(v_timer.id,v_timer.workspace_id,v_user,v_receipt);
  delete from public.running_timers where id=v_timer.id;
  perform private.audit(v_timer.workspace_id,'stop','timer',v_timer.id,jsonb_build_object('minutes',v_total));
  return query select * from jsonb_populate_recordset(null::public.time_entries,v_receipt) order by work_date,id;
end $$;
create function public.discard_timer(p_timer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=private.require_user(); v_timer public.running_timers;
begin
  perform private.lock_user(v_user);
  delete from public.running_timers where id=p_timer_id and user_id=v_user returning * into v_timer;
  -- Missing and nonowned IDs have the same harmless result. This also permits a
  -- client to retry after losing the original successful discard response.
  if not found then return; end if;
  perform private.audit(v_timer.workspace_id,'discard','timer',v_timer.id);
end $$;

-- Audit direct Data API writes as well as RPCs. We retain the entity and action,
-- never a copy of free-form notes or client details. Explicit workflow RPCs above
-- record their own semantically named events, avoiding duplicate status events.
create function private.audit_data_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_type text;
begin
  if tg_op='UPDATE' and tg_table_name='time_entries' and new.status is distinct from old.status then return null; end if;
  if tg_op='DELETE' then v_row:=to_jsonb(old); else v_row:=to_jsonb(new); end if;
  v_type:=case tg_table_name when 'time_entries' then 'time_entry' when 'projects' then 'project' else 'task' end;
  perform private.audit((v_row->>'workspace_id')::uuid,case tg_op when 'INSERT' then 'create' else lower(tg_op) end,v_type,(v_row->>'id')::uuid);
  return null;
end $$;
create trigger entry_audit after insert or update or delete on public.time_entries for each row execute function private.audit_data_change();
create trigger project_audit after insert or update on public.projects for each row execute function private.audit_data_change();
create trigger task_audit after insert or update or delete on public.tasks for each row execute function private.audit_data_change();

-- Revoke the PostgreSQL PUBLIC execute default for every application function.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_role(uuid),private.lock_user(uuid) to authenticated;
revoke all on function public.create_workspace(text,text,text),public.invite_member(uuid,text,text),public.accept_invitations(),public.set_member_role(uuid,uuid,text),public.submit_entries(uuid,date,date),public.review_entry(uuid,boolean),public.start_timer(uuid,uuid,text,boolean),public.stop_timer(uuid),public.discard_timer(uuid) from public,anon,authenticated;
grant execute on function public.create_workspace(text,text,text),public.invite_member(uuid,text,text),public.accept_invitations(),public.set_member_role(uuid,uuid,text),public.submit_entries(uuid,date,date),public.review_entry(uuid,boolean),public.start_timer(uuid,uuid,text,boolean),public.stop_timer(uuid),public.discard_timer(uuid) to authenticated;
