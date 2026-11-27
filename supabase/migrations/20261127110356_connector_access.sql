-- Drittanbieter-Tokens haben eine eigene API-Grenze. Interaktive VAVE.LOG-Sitzungen
-- behalten die Workspace-Rechte; der MCP-Client bekommt nur ausdrücklich freigegebene Daten.
create function private.vave_oauth_client() returns text
language sql stable set search_path='' as $$
  select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id','')
$$;
revoke all on function private.vave_oauth_client() from public,anon,authenticated;
grant execute on function private.vave_oauth_client() to authenticated;

-- Normale RPCs, darunter SECURITY DEFINER für Buchungen und Rollen, sind keine
-- Connector-API. Nur die drei unten definierten Operationen sind mit OAuth zulässig.
create function public.vave_request_gate() returns void
language plpgsql stable set search_path='' as $$
begin
  if nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id','') is not null and (
    current_setting('request.method',true) is distinct from 'POST'
    or not coalesce(current_setting('request.path',true) in (
      '/rpc/vave_mcp_workspaces','/rpc/vave_mcp_read','/rpc/vave_mcp_propose'
    ),false)
  ) then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
end $$;
revoke all on function public.vave_request_gate() from public,anon,authenticated;
-- Die Funktion liest ausschließlich den bereits verifizierten Request-Kontext.
-- Sie muss in PostgREST auch für Service- und weitere PostgREST-Rollen aufrufbar sein.
grant execute on function public.vave_request_gate() to public;
-- Supabase stellt authenticator bereit. SQL-Testumgebungen ohne API-Role prüfen
-- dieselbe Funktions- und RLS-Grenze direkt.
do $$
begin
  if exists(select 1 from pg_roles where rolname='authenticator') then
    if exists(
      select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
      cross join lateral unnest(s.setconfig) cfg
      where r.rolname='authenticator' and cfg like 'pgrst.db_pre_request=%'
        and cfg <> 'pgrst.db_pre_request=public.vave_request_gate'
    ) then
      raise exception 'VAVE.LOG requires its own Supabase project with an unassigned Data API pre-request hook.';
    end if;
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.vave_request_gate''';
    perform pg_notify('pgrst','reload config');
  end if;
end $$;

-- Auch außerhalb der Data API dürfen OAuth-Tokens keine Tabellenzeilen sehen
-- oder ändern. Der sichere MCP-Pfad verwendet bewusst minimale RPC-Projektionen.
do $$
declare tbl record;
begin
  for tbl in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
  loop
    execute format('create policy vave_interactive_session on public.%I as restrictive for all to authenticated
      using ((select private.vave_oauth_client()) is null)
      with check ((select private.vave_oauth_client()) is null)',tbl.relname);
  end loop;
end $$;

-- Zusätzlich lehnen die üblichen privilegierten Operationen OAuth-Sitzungen an
-- ihrer gemeinsamen Browser-Identitätsprüfung ab.
create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid := auth.uid();
begin
  if private.vave_oauth_client() is not null then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
  if v_id is null or not exists(select 1 from auth.users where id=v_id and email_confirmed_at is not null) then
    raise exception 'Eine bestätigte E-Mail und Anmeldung sind erforderlich.' using errcode='42501';
  end if;
  return v_id;
end $$;

create table private.vave_mcp_control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true
);
alter table private.vave_mcp_control enable row level security;
revoke all on private.vave_mcp_control from public,anon,authenticated;
insert into private.vave_mcp_control default values;

create table private.vave_mcp_clients (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  allow_proposals boolean not null default false,
  primary key (workspace_id,client_id)
);
alter table private.vave_mcp_clients enable row level security;
revoke all on private.vave_mcp_clients from public,anon,authenticated;

create function public.vave_mcp_access(p_workspace_id uuid)
returns table(client_id uuid,allow_proposals boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_role(p_workspace_id,array['owner']);
  return query select c.client_id,c.allow_proposals from private.vave_mcp_clients c
    where c.workspace_id=p_workspace_id order by c.client_id;
end $$;

create function public.vave_mcp_set_access(p_workspace_id uuid,p_client_id uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_role(p_workspace_id,array['owner']);
  if p_mode is null or p_mode not in ('off','read','propose') or p_client_id is null then
    raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023';
  end if;
  if p_mode='off' then
    delete from private.vave_mcp_clients where workspace_id=p_workspace_id and client_id=p_client_id;
  else
    insert into private.vave_mcp_clients(workspace_id,client_id,allow_proposals)
      values(p_workspace_id,p_client_id,p_mode='propose')
      on conflict (workspace_id,client_id) do update set allow_proposals=excluded.allow_proposals;
  end if;
  perform private.audit(p_workspace_id,'configure_connector','oauth_client',p_client_id,jsonb_build_object('mode',p_mode));
  raise log '%',jsonb_build_object('event','vave_connector_access_changed','client_id',p_client_id,'mode',p_mode);
end $$;

-- Ein bereits ausgestelltes Token genügt nach Widerruf der Zustimmung nicht.
-- Ohne die Supabase-OAuth-Tabellen bleibt der Zugriff gesperrt.
create function private.vave_mcp_actor(p_client_id uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
        session_uuid uuid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
begin
  if not exists(select 1 from private.vave_mcp_control where singleton and enabled)
    or session_uuid is null or to_regclass('auth.sessions') is null
    or actor is null or p_client_id is null or to_regclass('auth.oauth_consents') is null
    or not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null
      and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null
        or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<=now()))
  then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
  if not exists(select 1 from auth.oauth_consents c where c.user_id=actor
    and c.client_id=p_client_id and c.revoked_at is null)
    or not exists(select 1 from auth.sessions s where s.id=session_uuid
      and s.user_id=actor and s.oauth_client_id=p_client_id
      and (s.not_after is null or s.not_after>now()))
  then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function private.vave_mcp_actor(uuid) from public,anon,authenticated;

create function private.vave_mcp_workspace(p_workspace_id uuid,p_client_id uuid,p_propose boolean default false)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.vave_mcp_actor(p_client_id);
begin
  if private.current_role(p_workspace_id) is null or not exists(
    select 1 from private.vave_mcp_clients as c where c.workspace_id=p_workspace_id
      and c.client_id=p_client_id and (not p_propose or c.allow_proposals)
  ) then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function private.vave_mcp_workspace(uuid,uuid,boolean) from public,anon,authenticated;

create function public.vave_mcp_workspaces() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare client_uuid uuid:=private.vave_oauth_client()::uuid;
begin
  perform private.vave_mcp_actor(client_uuid);
  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.id) from (
      select w.id,w.name,w.timezone,w.currency,c.allow_proposals
      from public.workspaces w join private.vave_mcp_clients c on c.workspace_id=w.id
      where c.client_id=client_uuid and private.current_role(w.id) is not null
      order by w.id limit 100
    ) row_data
  ),'[]'::jsonb);
end $$;

create function public.vave_mcp_read(
  p_workspace_id uuid,p_resource text,p_after uuid default null,
  p_from date default null,p_to date default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.vave_mcp_workspace(p_workspace_id,private.vave_oauth_client()::uuid);
        result jsonb;
begin
  case p_resource
  when 'projects' then
    if not private.can(p_workspace_id,'projects','view') then raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501'; end if;
    select jsonb_agg(to_jsonb(r) order by r.id) into result from (
      select p.id,p.code,p.name,p.status,p.due_date
      from public.projects p where p.workspace_id=p_workspace_id and (p_after is null or p.id>p_after)
      order by p.id limit 50
    ) r;
  when 'tasks' then
    if not private.can(p_workspace_id,'tasks','view') then raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501'; end if;
    select jsonb_agg(to_jsonb(r) order by r.id) into result from (
      select t.id,t.title,t.project_id,t.status,t.due_date
      from public.tasks t where t.workspace_id=p_workspace_id and (p_after is null or t.id>p_after)
      order by t.id limit 50
    ) r;
  when 'time_entries','absences' then
    if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30
      or p_from<date '2000-01-01' or p_to>date '2100-12-31' then
      raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023';
    end if;
    if p_resource='time_entries' then
      select jsonb_agg(to_jsonb(r) order by r.id) into result from (
        select e.id,e.project_id,e.task_id,e.work_date,e.minutes,e.status,e.billable
        from public.time_entries e where e.workspace_id=p_workspace_id and e.user_id=actor
          and e.work_date between p_from and p_to and (p_after is null or e.id>p_after)
        order by e.id limit 50
      ) r;
    else
      select jsonb_agg(to_jsonb(r) order by r.id) into result from (
        select a.id,a.starts_on,a.ends_on,a.kind,a.status,a.half_day
        from public.absences a where a.workspace_id=p_workspace_id and a.user_id=actor
          and a.starts_on<=p_to and a.ends_on>=p_from and (p_after is null or a.id>p_after)
        order by a.id limit 50
      ) r;
    end if;
  else raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023';
  end case;
  return coalesce(result,'[]'::jsonb);
end $$;

-- Ein voller eindeutiger Index erlaubt NULL wie bisher und passt zu PostgRESTs
-- spaltenbezogenem Konfliktziel für Vorschläge aus älteren App-Versionen.
drop index public.time_suggestions_external;
create unique index time_suggestions_external on public.time_suggestions(workspace_id,user_id,external_id);

-- Diese Kennzeichnung stammt vom verifizierten OAuth-Token und kann von einem
-- interaktiven Aufruf weder gesetzt noch nachträglich geändert werden.
alter table public.time_suggestions add column oauth_client_id uuid;
create function private.vave_suggestion_provenance() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.oauth_client_id is distinct from old.oauth_client_id then
      raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
    end if;
  elsif new.oauth_client_id is not null and (
    current_user in ('anon','authenticated')
    or new.oauth_client_id::text is distinct from private.vave_oauth_client()
  ) then
    raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.vave_suggestion_provenance() from public,anon,authenticated;
create trigger vave_suggestion_provenance before insert or update on public.time_suggestions
  for each row execute function private.vave_suggestion_provenance();

create function public.vave_mcp_propose(p_workspace_id uuid,p_suggestions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare client_uuid uuid:=private.vave_oauth_client()::uuid;
        actor uuid:=private.vave_mcp_actor(client_uuid);
        proposal record;
        row_id uuid;
        reply jsonb:='[]'::jsonb;
        external_key text;
begin
  if coalesce(jsonb_typeof(p_suggestions),'') <> 'array' then
    raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023';
  end if;
  if jsonb_array_length(p_suggestions) not between 1 and 20 or octet_length(p_suggestions::text)>20000 then
    raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023';
  end if;
  perform private.lock_user(actor);
  perform private.vave_mcp_workspace(p_workspace_id,client_uuid,true);
  for proposal in select * from jsonb_to_recordset(p_suggestions) as s(
    external_id text,project_id uuid,task_id uuid,work_date date,minutes integer,note text
  )
  loop
    if proposal.external_id is null or length(btrim(proposal.external_id)) not between 1 and 120
      or proposal.minutes is null or proposal.minutes not between 1 and 1440
      or proposal.work_date is null or proposal.work_date not between date '2000-01-01' and date '2100-12-31'
      or length(coalesce(proposal.note,''))>240
    then raise exception 'VAVE_CONNECTOR_INVALID' using errcode='22023'; end if;
    external_key:='mcp:'||client_uuid::text||':'||btrim(proposal.external_id);
    select s.id into row_id from public.time_suggestions s where s.workspace_id=p_workspace_id
      and s.user_id=actor and s.external_id=external_key;
    if row_id is null then
      if (proposal.project_id is not null and (
          not private.can(p_workspace_id,'projects','view')
          or not exists(select 1 from public.projects p where p.workspace_id=p_workspace_id and p.id=proposal.project_id and p.status='active')
        )) or (proposal.task_id is not null and (
          not private.can(p_workspace_id,'tasks','view')
          or not exists(select 1 from public.tasks t where t.workspace_id=p_workspace_id and t.id=proposal.task_id and t.project_id=proposal.project_id)
        ))
      then raise exception 'VAVE_CONNECTOR_SCOPE' using errcode='42501'; end if;
      insert into public.time_suggestions(workspace_id,user_id,external_id,project_id,task_id,work_date,minutes,note,oauth_client_id)
        values(p_workspace_id,actor,external_key,proposal.project_id,proposal.task_id,proposal.work_date,proposal.minutes,coalesce(proposal.note,''),client_uuid)
        returning id into row_id;
    end if;
    reply:=reply||jsonb_build_array(jsonb_build_object('id',row_id,'external_id',proposal.external_id));
  end loop;
  return reply;
end $$;

revoke all on function public.vave_mcp_access(uuid),public.vave_mcp_set_access(uuid,uuid,text),
  public.vave_mcp_workspaces(),public.vave_mcp_read(uuid,text,uuid,date,date),public.vave_mcp_propose(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.vave_mcp_access(uuid),public.vave_mcp_set_access(uuid,uuid,text),
  public.vave_mcp_workspaces(),public.vave_mcp_read(uuid,text,uuid,date,date),public.vave_mcp_propose(uuid,jsonb)
  to authenticated;

-- Das Ereignis bleibt im Betreiber-Log auch verfügbar, wenn der Workspace und
-- seine fachlichen Audit-Daten aus der Anwendung gelöscht werden.
create function private.vave_workspace_deleted() returns trigger
language plpgsql set search_path='' as $$
begin
  raise log '%',jsonb_build_object('event','vave_workspace_deleted','workspace_id',old.id);
  return null;
end $$;
revoke all on function private.vave_workspace_deleted() from public,anon,authenticated;
create trigger vave_workspace_deleted after delete on public.workspaces
  for each row execute function private.vave_workspace_deleted();

notify pgrst, 'reload schema';
