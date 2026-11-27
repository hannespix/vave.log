-- Zugewiesene Personen mit Leserechten dürfen den Status ihrer Aufgabe ändern.
alter policy task_update on public.tasks
  using (private.can(workspace_id,'tasks','edit') or (assignee_id=(select auth.uid()) and private.can(workspace_id,'tasks','view')))
  with check (private.can(workspace_id,'tasks','edit') or (assignee_id=(select auth.uid()) and private.can(workspace_id,'tasks','view')));

create function private.guard_task_status_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Läuft vor den Lebenszyklus-Triggern. Ältere Clients dürfen unveränderte Felder mitsenden.
  if auth.uid() is not null and not private.can(old.workspace_id,'tasks','edit')
     and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
    raise exception 'Du darfst bei dieser Aufgabe nur den Status ändern.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_task_status_update() from public,anon,authenticated;
create trigger task_authorize_update before update on public.tasks
  for each row execute function private.guard_task_status_update();

create or replace function private.roll_repeating_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='done' and old.status<>'done' and old.repeat<>'' and auth.uid() is not null then
    insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,estimated_minutes,is_milestone,repeat,created_by)
    values(old.workspace_id,old.project_id,old.title,'todo',old.assignee_id,
      case when old.due_date is null then null else least(old.due_date + case old.repeat when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end, timestamp '2100-12-31')::date end,
      old.estimated_minutes,false,old.repeat,auth.uid());
    new.repeat := '';
  end if;
  return new;
end $$;

-- Die vollständige Übergabe archiviert das Projekt, kopiert Aufgaben, verschiebt den Plan
-- und enthält Teamzeit-Summen für das Restbudget. Beide Seiten brauchen die Modulrechte.
create function private.handover_can_transfer(p_rights jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_rights->>'projects'='edit' and p_rights->>'tasks'='edit'
    and p_rights->>'planning'='edit' and private.level_rank(p_rights->>'time_team')>=1,false)
$$;
revoke all on function private.handover_can_transfer(jsonb) from public,anon,authenticated;

create function private.lock_handover_approval(p_workspace_id uuid,p_user_id uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.memberships m join auth.users u on u.id=m.auth_user_id
  where m.workspace_id=p_workspace_id and m.user_id=p_user_id and not m.is_demo
    and u.email_confirmed_at is not null and m.role in ('owner','manager','member')
  for share of m,u;
  return found and private.handover_can_transfer(private.rights_of(p_workspace_id,p_user_id))
    and not exists(select 1 from public.workspace_demos d where d.workspace_id=p_workspace_id and d.archived_at is not null);
end $$;
revoke all on function private.lock_handover_approval(uuid,uuid) from public,anon,authenticated;

create function private.lock_handover_link(p_source_workspace_id uuid,p_target_workspace_id uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  -- Dieselbe Reihenfolge wie beim Löschen einer Firma und beim Trennen einer Verknüpfung.
  perform 1 from public.workspaces where id in (p_source_workspace_id,p_target_workspace_id)
    order by id for key share;
  perform 1 from public.workspace_links
    where workspace_a=least(p_source_workspace_id,p_target_workspace_id)
      and workspace_b=greatest(p_source_workspace_id,p_target_workspace_id) for share;
  return found;
end $$;
revoke all on function private.lock_handover_link(uuid,uuid) from public,anon,authenticated;

create function private.handover_for_viewer(p_handover public.project_handovers,p_rights jsonb) returns public.project_handovers
language plpgsql immutable set search_path = '' as $$
begin
  if private.level_rank(p_rights->>'time_team')=0 then
    p_handover.summary := p_handover.summary - array['budget_minutes','booked_minutes'];
  end if;
  if private.level_rank(p_rights->>'planning')=0 then
    p_handover.summary := p_handover.summary - array['plan_rows','planned_minutes'];
  end if;
  if private.level_rank(p_rights->>'tasks')=0 then
    p_handover.summary := p_handover.summary - 'open_tasks';
  end if;
  return p_handover;
end $$;
revoke all on function private.handover_for_viewer(public.project_handovers,jsonb) from public,anon,authenticated;

create function private.list_project_handovers(p_workspace_id uuid) returns setof public.project_handovers
language sql stable security definer set search_path = '' as $$
  select preview.*
  from public.project_handovers h
  cross join lateral private.handover_for_viewer(h,private.rights(p_workspace_id)) preview
  where auth.uid() is not null and private.can(p_workspace_id,'projects','view')
    and p_workspace_id in (h.source_workspace_id,h.target_workspace_id)
  order by h.offered_at desc,h.id desc limit 100
$$;
create function public.list_project_handovers(p_workspace_id uuid) returns setof public.project_handovers
language sql stable security invoker set search_path = '' as $$
  select * from private.list_project_handovers(p_workspace_id)
  order by offered_at desc,id desc
$$;
revoke all on function private.list_project_handovers(uuid),public.list_project_handovers(uuid) from public,anon,authenticated;
grant execute on function private.list_project_handovers(uuid),public.list_project_handovers(uuid) to authenticated;

create or replace function public.sister_workspaces(p_workspace_id uuid) returns table(workspace_id uuid,name text,currency text,timezone text,can_accept boolean,can_unlink boolean)
language sql stable security definer set search_path = '' as $$
  select w.id,w.name,w.currency,w.timezone,private.handover_can_transfer(private.rights(w.id)),private.can(p_workspace_id,'settings','edit')
  from public.workspace_links l
  join public.workspaces w on w.id=case when l.workspace_a=p_workspace_id then l.workspace_b else l.workspace_a end
  where p_workspace_id in (l.workspace_a,l.workspace_b) and private.current_role(p_workspace_id) is not null
  order by w.name
$$;

-- Anbieten mit Übergaberechten in der abgebenden Firma.
create or replace function public.offer_project_handover(p_project_id uuid,p_target_workspace_id uuid,p_note text default '') returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); p public.projects; v_row public.project_handovers; v_today date; v_week date; v_summary jsonb;
begin
  select * into p from public.projects where id=p_project_id;
  if p.id is null or not private.handover_can_transfer(private.rights(p.workspace_id)) then
    raise exception 'Für die Übergabe fehlen Rechte für Projekte, Aufgaben, Kapazität oder Teamzeiten.' using errcode='42501';
  end if;
  if p_target_workspace_id is null or not private.linked(p.workspace_id,p_target_workspace_id)
     or not private.lock_handover_link(p.workspace_id,p_target_workspace_id) then
    raise exception 'Diese Firma ist nicht verknüpft.';
  end if;
  if not private.lock_handover_approval(p.workspace_id,v_user) then
    raise exception 'Für die Übergabe fehlen Rechte für Projekte, Aufgaben, Kapazität oder Teamzeiten.' using errcode='42501';
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

create or replace function public.withdraw_project_handover(p_handover_id uuid) returns public.project_handovers
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
  return private.handover_for_viewer(h,private.rights(h.source_workspace_id));
end $$;

create or replace function public.decline_project_handover(p_handover_id uuid) returns public.project_handovers
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
  return private.handover_for_viewer(h,private.rights(h.target_workspace_id));
end $$;

-- Annehmen mit Übergaberechten in der Zielfirma und weiterhin gültiger Freigabe der Quelle.
create or replace function public.accept_project_handover(p_handover_id uuid) returns public.project_handovers
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user(); h public.project_handovers; p public.projects;
  v_today date; v_week date; v_code text; v_new uuid; v_booked bigint; v_type uuid; v_row uuid;
  v_linked boolean; n integer := 1; r record;
begin
  select * into h from public.project_handovers where id=p_handover_id;
  if h.id is null or not private.handover_can_transfer(private.rights(h.target_workspace_id)) then
    raise exception 'Für die Übergabe fehlen Rechte für Projekte, Aufgaben, Kapazität oder Teamzeiten.' using errcode='42501';
  end if;
  v_linked := private.lock_handover_link(h.source_workspace_id,h.target_workspace_id);
  select * into h from public.project_handovers where id=p_handover_id for update;
  if h.id is null then raise exception 'Dieses Angebot steht nicht mehr zur Verfügung.'; end if;
  if h.status<>'offered' then raise exception 'Dieses Angebot ist schon entschieden.'; end if;
  if not v_linked then raise exception 'Diese Firma ist nicht mehr verknüpft.'; end if;
  if not private.lock_handover_approval(h.target_workspace_id,v_user) then
    raise exception 'Für die Übergabe fehlen Rechte für Projekte, Aufgaben, Kapazität oder Teamzeiten.' using errcode='42501';
  end if;
  if not private.lock_handover_approval(h.source_workspace_id,h.offered_by) then
    raise exception 'Die anbietende Person hat keine Berechtigung mehr für diese Übergabe.' using errcode='42501';
  end if;
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
