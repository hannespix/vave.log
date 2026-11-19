-- Firmenverbund (20.11.2026).
--
-- Jede Firma ist ein eigener Workspace: eigene Mitglieder und Rechte, Währung, Zeitzone, Feiertage,
-- Rechnungskreis. Neu ist die Verbindung zwischen ihnen:
--
-- 1. Zwei Workspaces lassen sich als Schwesterfirmen verknüpfen. Das darf nur, wer in beiden die
--    Einstellungen bearbeiten darf – es gibt keine Suche nach fremden Workspaces und keine Einladung.
-- 2. Ein Projekt lässt sich einer Schwesterfirma anbieten. Nimmt dort jemand mit Projektrecht an, entsteht
--    das Projekt in der Zielfirma: mit laufenden und künftigen Phasen, offenen Aufgaben und dem
--    Kapazitätsplan ab der laufenden Woche. Das Original wird archiviert.
--
-- Bewusst nicht übertragen: gebuchte Zeiten, Rechnungen, Angebote, Ausgaben und die Finanzplanung. Sie
-- gehören zur abgebenden Firma (eigene Währung, eigener Rechnungskreis) und bleiben dort lesbar.

create table public.workspace_links (
  id uuid primary key default gen_random_uuid(),
  workspace_a uuid not null references public.workspaces(id),
  workspace_b uuid not null references public.workspaces(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (workspace_a < workspace_b),
  unique (workspace_a, workspace_b)
);
create index workspace_links_b on public.workspace_links(workspace_b);
alter table public.workspace_links enable row level security;
create policy workspace_links_read on public.workspace_links for select to authenticated
  using (workspace_a in (select private.member_workspaces()) or workspace_b in (select private.member_workspaces()));
revoke all on table public.workspace_links from public,anon,authenticated;
grant select on table public.workspace_links to authenticated;

create table public.project_handovers (
  id uuid primary key default gen_random_uuid(),
  source_workspace_id uuid not null references public.workspaces(id),
  source_project_id uuid not null,
  target_workspace_id uuid not null references public.workspaces(id),
  target_project_id uuid,
  status text not null default 'offered' check (status in ('offered','accepted','declined','withdrawn')),
  note text not null default '' check (length(note)<=1000),
  -- Kurzfassung zum Zeitpunkt des Angebots: Die Zielfirma liest sie, ohne Zugriff auf die Tabellen der Quelle.
  summary jsonb not null,
  offered_by uuid not null,
  offered_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  check (source_workspace_id <> target_workspace_id),
  check ((status='offered') = (decided_at is null))
);
create unique index project_handovers_one_open on public.project_handovers(source_workspace_id,source_project_id) where status='offered';
create index project_handovers_target on public.project_handovers(target_workspace_id,status);
alter table public.project_handovers enable row level security;
create policy project_handovers_read on public.project_handovers for select to authenticated
  using (source_workspace_id in (select private.member_workspaces()) or target_workspace_id in (select private.member_workspaces()));
revoke all on table public.project_handovers from public,anon,authenticated;
grant select on table public.project_handovers to authenticated;

create function private.linked(p_a uuid,p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_links where workspace_a=least(p_a,p_b) and workspace_b=greatest(p_a,p_b))
$$;
revoke all on function private.linked(uuid,uuid) from public,anon,authenticated;

-- Verknüpfen: nur mit dem Recht „Einstellungen bearbeiten“ in beiden Firmen. Demo-Workspaces bleiben für sich.
create function public.link_workspaces(p_workspace_id uuid,p_other_workspace_id uuid) returns public.workspace_links
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.workspace_links;
begin
  if p_workspace_id is null or p_other_workspace_id is null or p_workspace_id=p_other_workspace_id then
    raise exception 'Zwei verschiedene Firmen wählen.';
  end if;
  if not private.can(p_workspace_id,'settings','edit') or not private.can(p_other_workspace_id,'settings','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Einstellungen bearbeiten in beiden Firmen.' using errcode='42501';
  end if;
  if exists(select 1 from public.workspace_demos where workspace_id in (p_workspace_id,p_other_workspace_id)) then
    raise exception 'Ein Demo-Workspace lässt sich nicht mit einer Firma verknüpfen.';
  end if;
  insert into public.workspace_links(workspace_a,workspace_b,created_by)
  values(least(p_workspace_id,p_other_workspace_id),greatest(p_workspace_id,p_other_workspace_id),v_user)
  on conflict (workspace_a,workspace_b) do update set workspace_a=excluded.workspace_a
  returning * into v_row;
  perform private.audit(p_workspace_id,'link','workspace',p_other_workspace_id,'{}'::jsonb);
  perform private.audit(p_other_workspace_id,'link','workspace',p_workspace_id,'{}'::jsonb);
  return v_row;
end $$;

-- Trennen darf jede der beiden Seiten. Offene Angebote zwischen den Firmen verfallen.
create function public.unlink_workspaces(p_workspace_id uuid,p_other_workspace_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user();
begin
  if not private.can(p_workspace_id,'settings','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Einstellungen bearbeiten.' using errcode='42501';
  end if;
  delete from public.workspace_links where workspace_a=least(p_workspace_id,p_other_workspace_id) and workspace_b=greatest(p_workspace_id,p_other_workspace_id);
  if not found then return; end if;
  update public.project_handovers set status='withdrawn',decided_by=v_user,decided_at=now()
  where status='offered' and ((source_workspace_id=p_workspace_id and target_workspace_id=p_other_workspace_id)
    or (source_workspace_id=p_other_workspace_id and target_workspace_id=p_workspace_id));
  perform private.audit(p_workspace_id,'unlink','workspace',p_other_workspace_id,'{}'::jsonb);
  -- Die andere Seite erfährt es über ihr eigenes Protokoll; dort ist die Person vielleicht kein Mitglied.
  insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  values(p_other_workspace_id,v_user,'unlink','workspace',p_workspace_id,'{}'::jsonb);
end $$;

-- Die Schwesterfirmen einer Firma, mit Namen. Mitglieder der einen Firma sind in der anderen oft kein
-- Mitglied und könnten deren Namen sonst nicht lesen.
create function public.sister_workspaces(p_workspace_id uuid) returns table(workspace_id uuid,name text,currency text,timezone text,can_accept boolean,can_unlink boolean)
language sql stable security definer set search_path = '' as $$
  select w.id,w.name,w.currency,w.timezone,private.can(w.id,'projects','edit'),private.can(p_workspace_id,'settings','edit')
  from public.workspace_links l
  join public.workspaces w on w.id=case when l.workspace_a=p_workspace_id then l.workspace_b else l.workspace_a end
  where p_workspace_id in (l.workspace_a,l.workspace_b) and private.current_role(p_workspace_id) is not null
  order by w.name
$$;

-- Anbieten: Projektrecht in der abgebenden Firma, die Zielfirma muss verknüpft sein.
create function public.offer_project_handover(p_project_id uuid,p_target_workspace_id uuid,p_note text default '') returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); p public.projects; v_row public.project_handovers; v_today date; v_week date; v_summary jsonb;
begin
  select * into p from public.projects where id=p_project_id;
  if p.id is null or not private.can(p.workspace_id,'projects','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Projekte bearbeiten.' using errcode='42501';
  end if;
  if p_target_workspace_id is null or not private.linked(p.workspace_id,p_target_workspace_id) then
    raise exception 'Diese Firma ist nicht verknüpft.';
  end if;
  if p.status='archived' then raise exception 'Ein archiviertes Projekt lässt sich nicht übergeben.'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Die Notiz ist zu lang (höchstens 1000 Zeichen).'; end if;
  if exists(select 1 from public.project_handovers where source_workspace_id=p.workspace_id and source_project_id=p.id and status='offered') then
    raise exception 'Für dieses Projekt liegt schon ein offenes Angebot vor.';
  end if;
  select (now() at time zone w.timezone)::date into v_today from public.workspaces w where w.id=p.workspace_id;
  v_week := date_trunc('week',v_today)::date;
  v_summary := jsonb_build_object(
    'code',p.code,'name',p.name,'client',p.client,'due_date',p.due_date,'budget_minutes',p.budget_minutes,
    'booked_minutes',(select coalesce(sum(e.minutes),0) from public.time_entries e where e.workspace_id=p.workspace_id and e.project_id=p.id),
    'phases',(select count(*) from public.project_phases ph where ph.workspace_id=p.workspace_id and ph.project_id=p.id and (ph.ends_on is null or ph.ends_on>=v_today)),
    'open_tasks',(select count(*) from public.tasks t where t.workspace_id=p.workspace_id and t.project_id=p.id and t.status<>'done'),
    'plan_rows',(select count(*) from public.capacity_rows r where r.workspace_id=p.workspace_id and r.project_id=p.id
       and exists(select 1 from public.capacity_cells c where c.row_id=r.id and c.week_start>=v_week and c.minutes>0)),
    'planned_minutes',(select coalesce(sum(c.minutes),0) from public.capacity_cells c join public.capacity_rows r on r.id=c.row_id
       where r.workspace_id=p.workspace_id and r.project_id=p.id and c.week_start>=v_week),
    'source_name',(select name from public.workspaces where id=p.workspace_id),
    'target_name',(select name from public.workspaces where id=p_target_workspace_id),
    'offered_by_name',(select coalesce(nullif(m.display_name,''),m.email) from public.memberships m where m.workspace_id=p.workspace_id and m.user_id=v_user));
  insert into public.project_handovers(source_workspace_id,source_project_id,target_workspace_id,note,summary,offered_by)
  values(p.workspace_id,p.id,p_target_workspace_id,btrim(coalesce(p_note,'')),v_summary,v_user) returning * into v_row;
  perform private.audit(p.workspace_id,'handover_offer','project',p.id,jsonb_build_object('target_workspace_id',p_target_workspace_id));
  return v_row;
end $$;

create function public.withdraw_project_handover(p_handover_id uuid) returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); h public.project_handovers;
begin
  select * into h from public.project_handovers where id=p_handover_id for update;
  if h.id is null or not private.can(h.source_workspace_id,'projects','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Projekte bearbeiten.' using errcode='42501';
  end if;
  if h.status<>'offered' then raise exception 'Dieses Angebot ist schon entschieden.'; end if;
  update public.project_handovers set status='withdrawn',decided_by=v_user,decided_at=now() where id=h.id returning * into h;
  perform private.audit(h.source_workspace_id,'handover_withdraw','project',h.source_project_id,'{}'::jsonb);
  return h;
end $$;

create function public.decline_project_handover(p_handover_id uuid) returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); h public.project_handovers;
begin
  select * into h from public.project_handovers where id=p_handover_id for update;
  if h.id is null or not private.can(h.target_workspace_id,'projects','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Projekte bearbeiten.' using errcode='42501';
  end if;
  if h.status<>'offered' then raise exception 'Dieses Angebot ist schon entschieden.'; end if;
  update public.project_handovers set status='declined',decided_by=v_user,decided_at=now() where id=h.id returning * into h;
  perform private.audit(h.target_workspace_id,'handover_decline','project',h.source_project_id,jsonb_build_object('source_workspace_id',h.source_workspace_id));
  return h;
end $$;

-- Annehmen: Projektrecht in der Zielfirma. Legt das Projekt dort an und archiviert das Original.
create function public.accept_project_handover(p_handover_id uuid) returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user(); h public.project_handovers; p public.projects;
  v_today date; v_week date; v_code text; v_new uuid; v_booked bigint; v_type uuid; v_row uuid; n integer := 1; r record;
begin
  select * into h from public.project_handovers where id=p_handover_id for update;
  if h.id is null or not private.can(h.target_workspace_id,'projects','edit') then
    raise exception 'Dafür fehlt die Berechtigung: Projekte bearbeiten.' using errcode='42501';
  end if;
  if h.status<>'offered' then raise exception 'Dieses Angebot ist schon entschieden.'; end if;
  if not private.linked(h.source_workspace_id,h.target_workspace_id) then raise exception 'Diese Firma ist nicht mehr verknüpft.'; end if;
  select * into p from public.projects where workspace_id=h.source_workspace_id and id=h.source_project_id for update;
  if p.id is null or p.status='archived' then raise exception 'Das Projekt steht nicht mehr zur Übergabe.'; end if;
  if exists(select 1 from public.running_timers where workspace_id=p.workspace_id and project_id=p.id) then
    raise exception 'Auf dem Projekt läuft noch ein Timer. Bitte erst stoppen.';
  end if;
  select (now() at time zone w.timezone)::date into v_today from public.workspaces w where w.id=h.target_workspace_id;
  v_week := date_trunc('week',v_today)::date;

  -- Projektkürzel: wie im Original; ist es in der Zielfirma vergeben, mit laufender Nummer.
  v_code := p.code;
  while exists(select 1 from public.projects where workspace_id=h.target_workspace_id and code=v_code) loop
    n := n+1; v_code := left(p.code,24-length('-'||n))||'-'||n;
  end loop;
  -- Das Budget wandert als Rest: was im Original schon gebucht ist, bleibt dort.
  select coalesce(sum(minutes),0) into v_booked from public.time_entries where workspace_id=p.workspace_id and project_id=p.id;
  insert into public.projects(workspace_id,code,name,client,budget_minutes,status,color,due_date,tags,billable_default)
  values(h.target_workspace_id,v_code,p.name,p.client,greatest(p.budget_minutes-v_booked,0)::integer,'active',p.color,p.due_date,p.tags,p.billable_default)
  returning id into v_new;

  -- Laufende und künftige Phasen.
  insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on,budget_minutes)
  select h.target_workspace_id,v_new,ph.name,ph.position,ph.starts_on,ph.ends_on,ph.budget_minutes
  from public.project_phases ph where ph.workspace_id=p.workspace_id and ph.project_id=p.id and (ph.ends_on is null or ph.ends_on>=v_today);

  -- Offene Aufgaben. Die Person bleibt zugewiesen, wenn sie auch in der Zielfirma aktiv ist.
  insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,estimated_minutes,is_milestone,repeat,tags,created_by)
  select h.target_workspace_id,v_new,t.title,t.status,
    (select m.user_id from public.memberships m where m.workspace_id=h.target_workspace_id and m.user_id=t.assignee_id and m.role<>'disabled' and not m.is_demo),
    t.due_date,t.estimated_minutes,t.is_milestone,t.repeat,t.tags,v_user
  from public.tasks t where t.workspace_id=p.workspace_id and t.project_id=p.id and t.status<>'done' order by t.created_at,t.id;

  -- Kapazitätsplan ab der laufenden Woche. Leistungsarten werden über den Namen zugeordnet und bei Bedarf angelegt.
  -- Wer in der Zielfirma kein Mitglied ist, wird zur offenen Stelle; der Name steht dann in der Notiz.
  for r in select cr.*,st.name as type_name,coalesce(nullif(sm.display_name,''),split_part(coalesce(sm.email,''),'@',1)) as person_name,
      (select m.user_id from public.memberships m where m.workspace_id=h.target_workspace_id and m.user_id=cr.user_id and m.role<>'disabled' and not m.is_demo) as target_user
    from public.capacity_rows cr
    left join public.service_types st on st.id=cr.service_type_id
    left join public.memberships sm on sm.workspace_id=cr.workspace_id and sm.user_id=cr.user_id
    where cr.workspace_id=p.workspace_id and cr.project_id=p.id
      and exists(select 1 from public.capacity_cells c where c.row_id=cr.id and c.week_start>=v_week and c.minutes>0)
    order by cr.position,cr.created_at,cr.id loop
    v_type := null;
    if r.type_name is not null then
      select id into v_type from public.service_types where workspace_id=h.target_workspace_id and lower(btrim(name))=lower(btrim(r.type_name));
      if v_type is null then
        insert into public.service_types(workspace_id,name,position)
        values(h.target_workspace_id,r.type_name,(select coalesce(max(position),0)+1 from public.service_types where workspace_id=h.target_workspace_id))
        returning id into v_type;
      end if;
    end if;
    insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,offered_minutes,note,position)
    values(h.target_workspace_id,v_new,r.target_user,v_type,r.offered_minutes,
      case when r.note<>'' or r.target_user is not null or r.person_name='' then r.note else left(r.person_name,240) end,r.position)
    returning id into v_row;
    insert into public.capacity_cells(workspace_id,row_id,week_start,minutes)
    select h.target_workspace_id,v_row,c.week_start,c.minutes from public.capacity_cells c where c.row_id=r.id and c.week_start>=v_week and c.minutes>0;
  end loop;

  -- Das Original: archiviert, künftige Planung entfernt. Zeiten, Rechnungen und Vergangenheit bleiben.
  delete from public.capacity_cells c using public.capacity_rows cr
  where cr.id=c.row_id and cr.workspace_id=p.workspace_id and cr.project_id=p.id and c.week_start>=v_week;
  update public.projects set status='archived' where id=p.id;

  update public.project_handovers set status='accepted',target_project_id=v_new,decided_by=v_user,decided_at=now() where id=h.id returning * into h;
  perform private.audit(h.target_workspace_id,'handover_accept','project',v_new,jsonb_build_object('source_workspace_id',h.source_workspace_id,'source_project_id',h.source_project_id));
  -- Protokoll der abgebenden Firma – die annehmende Person ist dort vielleicht kein Mitglied.
  insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id,details)
  values(h.source_workspace_id,v_user,'handover_accepted','project',h.source_project_id,jsonb_build_object('target_workspace_id',h.target_workspace_id,'target_project_id',v_new));
  return h;
end $$;

revoke all on function public.link_workspaces(uuid,uuid),public.unlink_workspaces(uuid,uuid),public.sister_workspaces(uuid),
  public.offer_project_handover(uuid,uuid,text),public.withdraw_project_handover(uuid),public.decline_project_handover(uuid),
  public.accept_project_handover(uuid) from public,anon,authenticated;
grant execute on function public.link_workspaces(uuid,uuid),public.unlink_workspaces(uuid,uuid),public.sister_workspaces(uuid),
  public.offer_project_handover(uuid,uuid,text),public.withdraw_project_handover(uuid),public.decline_project_handover(uuid),
  public.accept_project_handover(uuid) to authenticated;

-- Wird eine Firma gelöscht, gehen ihre Verknüpfungen und Übergaben mit.
do $patch$
declare def text:=pg_get_functiondef('private.delete_workspace(uuid,text,boolean)'::regprocedure); anchor text:=' delete from public.workspaces where id=p_workspace_id;';
begin
  if position(anchor in def)=0 then raise exception 'delete_workspace: unerwartete Fassung'; end if;
  execute replace(def,anchor,' delete from public.project_handovers where source_workspace_id=p_workspace_id or target_workspace_id=p_workspace_id;'||E'\n'
    ||' delete from public.workspace_links where workspace_a=p_workspace_id or workspace_b=p_workspace_id;'||E'\n'||anchor);
end $patch$;
