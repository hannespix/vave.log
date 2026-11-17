-- Phasen, Leistungsarten und Kapazitätsplan (Schulterblick 16.11.2026).
--
-- 1. Projekte bekommen Phasen (Name, Zeitraum, Stundenbudget) – die Ebene zwischen Projekt und Aufgabe.
-- 2. Leistungsarten je Workspace (PM, CD, 3D …): die Rolle, in der jemand an einem Projekt arbeitet.
-- 3. Zeiten werden auf Phase und Leistungsart gebucht. Fehlt die Angabe, ergänzt die Datenbank sie
--    aus dem Zeitraum der Phase und aus dem Kapazitätsplan – auch für Timer, Vorschläge und MCP.
-- 4. „Abrechenbar“ ist eine Eigenschaft des Projekts. Mitarbeitende wählen nicht mehr; abweichen darf
--    nur, wer Projekte oder die Zeiten des Teams bearbeitet.
-- 5. Kapazitätsplan: Zeilen (Projekt × Leistungsart × Person) mit Stunden je Kalenderwoche – die
--    Matrix, die bisher in Excel lebt. Dazu das Recht „Kapazität planen“ (planning: edit).
-- 6. Import eines ganzen Plans in einem Schritt; Beispieldaten für Demo-Workspaces.

-- ---------------------------------------------------------------- Rechte
create or replace function private.template_rights(p_template text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_template
    when 'admin' then '{"projects":"edit","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"edit","strengths":"edit","finance":"edit","team":"edit","settings":"edit"}'::jsonb
    when 'leitung' then '{"projects":"edit","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"edit","strengths":"edit","finance":"edit","team":"view","settings":"edit"}'::jsonb
    when 'projektplanung' then '{"projects":"edit","tasks":"edit","time_team":"view","absences_team":"view","planning":"edit","strengths":"view","finance":"none","team":"view","settings":"none"}'::jsonb
    when 'personal' then '{"projects":"view","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"view","strengths":"edit","finance":"none","team":"edit","settings":"none"}'::jsonb
    when 'finanzen' then '{"projects":"view","tasks":"view","time_team":"view","absences_team":"none","planning":"none","strengths":"none","finance":"edit","team":"none","settings":"none"}'::jsonb
    when 'lesen' then '{"projects":"view","tasks":"view","time_team":"view","absences_team":"view","planning":"view","strengths":"view","finance":"view","team":"view","settings":"none"}'::jsonb
    else '{"projects":"view","tasks":"edit","time_team":"none","absences_team":"none","planning":"none","strengths":"none","finance":"none","team":"none","settings":"none"}'::jsonb
  end
$$;
create or replace function private.valid_permissions(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p)='object'
    and (select coalesce(bool_and(key in ('projects','tasks','time_team','absences_team','planning','strengths','finance','team','settings')),true) from jsonb_object_keys(p) key)
    and (select count(*) from jsonb_object_keys(p))=9
    and p->>'projects' in ('view','edit') and p->>'tasks' in ('view','edit')
    and p->>'time_team' in ('none','view','edit') and p->>'absences_team' in ('none','view','edit')
    and p->>'planning' in ('none','view','edit') and p->>'strengths' in ('none','view','edit')
    and p->>'finance' in ('none','view','edit') and p->>'team' in ('none','view','edit')
    and p->>'settings' in ('none','edit')
$$;

-- ---------------------------------------------------------------- Leistungsarten
create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create unique index service_types_name on public.service_types(workspace_id,lower(btrim(name)));
alter table public.service_types enable row level security;
revoke all on public.service_types from public,anon,authenticated;
grant select,insert,update,delete on public.service_types to authenticated;
create policy service_types_read on public.service_types for select to authenticated using(private.current_role(workspace_id) is not null);
create policy service_types_insert on public.service_types for insert to authenticated with check(private.can(workspace_id,'planning','edit') or private.can(workspace_id,'settings','edit'));
create policy service_types_update on public.service_types for update to authenticated using(private.can(workspace_id,'planning','edit') or private.can(workspace_id,'settings','edit')) with check(private.can(workspace_id,'planning','edit') or private.can(workspace_id,'settings','edit'));
create policy service_types_delete on public.service_types for delete to authenticated using(private.can(workspace_id,'planning','edit') or private.can(workspace_id,'settings','edit'));

-- ---------------------------------------------------------------- Phasen
create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  position integer not null default 0,
  starts_on date check (starts_on is null or starts_on between date '2000-01-01' and date '2100-12-31'),
  ends_on date check (ends_on is null or ends_on between date '2000-01-01' and date '2100-12-31'),
  budget_minutes integer not null default 0 check (budget_minutes between 0 and 52560000),
  created_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on>=starts_on),
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id),
  unique(workspace_id,id)
);
create unique index project_phases_name on public.project_phases(project_id,lower(btrim(name)));
create index project_phases_workspace_project on public.project_phases(workspace_id,project_id);
alter table public.project_phases enable row level security;
revoke all on public.project_phases from public,anon,authenticated;
grant select,insert,update,delete on public.project_phases to authenticated;
create policy project_phases_read on public.project_phases for select to authenticated using(private.current_role(workspace_id) is not null);
create policy project_phases_insert on public.project_phases for insert to authenticated with check(private.can(workspace_id,'projects','edit') or private.can(workspace_id,'planning','edit'));
create policy project_phases_update on public.project_phases for update to authenticated using(private.can(workspace_id,'projects','edit') or private.can(workspace_id,'planning','edit')) with check(private.can(workspace_id,'projects','edit') or private.can(workspace_id,'planning','edit'));
create policy project_phases_delete on public.project_phases for delete to authenticated using(private.can(workspace_id,'projects','edit') or private.can(workspace_id,'planning','edit'));

-- ---------------------------------------------------------------- Kapazitätsplan
-- Eine Zeile ist, was in der Excel-Matrix eine Zeile war: Projekt, Rolle, Person (oder noch offen),
-- angebotene Stunden. Die Zellen tragen die geplanten Minuten je Kalenderwoche (Montag).
create table public.capacity_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  user_id uuid,
  service_type_id uuid,
  offered_minutes integer check (offered_minutes is null or offered_minutes between 0 and 52560000),
  note text not null default '' check (length(note)<=240),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (workspace_id,project_id) references public.projects(workspace_id,id),
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id),
  foreign key (workspace_id,service_type_id) references public.service_types(workspace_id,id) on delete set null (service_type_id),
  unique(workspace_id,id)
);
create index capacity_rows_workspace_project on public.capacity_rows(workspace_id,project_id);
create index capacity_rows_workspace_user on public.capacity_rows(workspace_id,user_id);
create index capacity_rows_workspace_service_type on public.capacity_rows(workspace_id,service_type_id);
create table public.capacity_cells (
  workspace_id uuid not null references public.workspaces(id),
  row_id uuid not null,
  week_start date not null check (extract(isodow from week_start)=1 and week_start between date '2000-01-03' and date '2100-12-27'),
  minutes integer not null check (minutes between 1 and 10080),
  primary key (row_id,week_start),
  foreign key (workspace_id,row_id) references public.capacity_rows(workspace_id,id) on delete cascade
);
create index capacity_cells_workspace_week on public.capacity_cells(workspace_id,week_start);
create index capacity_cells_workspace_row on public.capacity_cells(workspace_id,row_id);
alter table public.capacity_rows enable row level security;
alter table public.capacity_cells enable row level security;
revoke all on public.capacity_rows,public.capacity_cells from public,anon,authenticated;
grant select,insert,update,delete on public.capacity_rows,public.capacity_cells to authenticated;
-- Den Plan sieht, wer die Planung sieht; die eigenen Zeilen sieht jede Person („wofür bin ich eingeplant?“).
create policy capacity_rows_read on public.capacity_rows for select to authenticated using(private.can(workspace_id,'planning','view') or (user_id=(select auth.uid()) and private.current_role(workspace_id) is not null));
create policy capacity_rows_insert on public.capacity_rows for insert to authenticated with check(private.can(workspace_id,'planning','edit'));
create policy capacity_rows_update on public.capacity_rows for update to authenticated using(private.can(workspace_id,'planning','edit')) with check(private.can(workspace_id,'planning','edit'));
create policy capacity_rows_delete on public.capacity_rows for delete to authenticated using(private.can(workspace_id,'planning','edit'));
create policy capacity_cells_read on public.capacity_cells for select to authenticated using(private.can(workspace_id,'planning','view') or exists(select 1 from public.capacity_rows r where r.id=row_id and r.user_id=(select auth.uid())));
create policy capacity_cells_insert on public.capacity_cells for insert to authenticated with check(private.can(workspace_id,'planning','edit'));
create policy capacity_cells_update on public.capacity_cells for update to authenticated using(private.can(workspace_id,'planning','edit')) with check(private.can(workspace_id,'planning','edit'));
create policy capacity_cells_delete on public.capacity_cells for delete to authenticated using(private.can(workspace_id,'planning','edit'));

-- ---------------------------------------------------------------- Buchung auf Phase und Leistungsart
alter table public.projects add column billable_default boolean not null default true;
-- Projekte, auf die bisher nie abrechenbar gebucht wurde (intern, Pitch), bleiben nicht abrechenbar.
update public.projects p set billable_default=false
where exists(select 1 from public.time_entries e where e.workspace_id=p.workspace_id and e.project_id=p.id)
  and not exists(select 1 from public.time_entries e where e.workspace_id=p.workspace_id and e.project_id=p.id and e.billable);

alter table public.time_entries add column phase_id uuid, add column service_type_id uuid;
alter table public.time_entries add constraint time_entries_phase_fkey foreign key(workspace_id,phase_id) references public.project_phases(workspace_id,id) on delete set null (phase_id);
alter table public.time_entries add constraint time_entries_service_type_fkey foreign key(workspace_id,service_type_id) references public.service_types(workspace_id,id) on delete set null (service_type_id);
create index time_entries_workspace_phase on public.time_entries(workspace_id,phase_id) where phase_id is not null;
create index time_entries_workspace_service_type on public.time_entries(workspace_id,service_type_id) where service_type_id is not null;

create or replace function private.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if current_user not in ('anon','authenticated') then
      if private.workspace_delete_allowed(old.workspace_id) then return old; end if;
    end if;
  end if;
  if tg_op='DELETE' then
    if old.status<>'draft' or old.user_id is distinct from auth.uid() then raise exception 'Nur eigene Entwürfe können gelöscht werden.'; end if;
    perform private.lock_user(old.user_id);
    if private.current_role(old.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if (new.user_id is distinct from auth.uid() or new.status<>'draft') and not (current_user not in ('anon','authenticated') and private.demo_can_seed_entry(new.workspace_id,new.user_id)) then raise exception 'Nur eigene Entwürfe können erstellt werden.'; end if;
    if current_user in ('anon','authenticated') and new.timer_id is not null then raise exception 'Timer-Zuordnung ist geschützt.'; end if;
  else
    -- Referentielle Aktionen und Systempfade: Wird eine Aufgabe, Phase oder Leistungsart gelöscht (oder trägt die
    -- Demo sie nach), ändert sich nur der Verweis – auch an eingereichten und freigegebenen Zeiten.
    if current_user not in ('anon','authenticated') and (to_jsonb(new)-'task_id'-'phase_id'-'service_type_id') is not distinct from (to_jsonb(old)-'task_id'-'phase_id'-'service_type_id')
       and (new.task_id is null or new.task_id is not distinct from old.task_id)
       and (new.phase_id is null or new.phase_id is not distinct from old.phase_id or private.demo_seeding(new.workspace_id))
       and (new.service_type_id is null or new.service_type_id is not distinct from old.service_type_id or private.demo_seeding(new.workspace_id)) then return new; end if;
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.timer_id is distinct from old.timer_id or new.created_at is distinct from old.created_at then
      raise exception 'Identität und Timer-Zuordnung sind unveränderlich.';
    end if;
    if new.status is distinct from old.status then
      if current_user in ('anon','authenticated') then raise exception 'Statuswechsel erfordern die Freigabe-Funktion.'; end if;
      if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Ein Statuswechsel darf den Inhalt nicht verändern.'; end if;
      if old.status='draft' and new.status='submitted' and old.user_id=auth.uid() then null;
      elsif old.status='submitted' and new.status in ('draft','approved') and private.can(old.workspace_id,'time_team','edit') then null;
      elsif old.status='approved' and new.status='draft' and private.can(old.workspace_id,'time_team','edit') then null;
      else raise exception 'Ungültiger Statuswechsel.'; end if;
    elsif old.status<>'draft' or old.user_id is distinct from auth.uid() then
      raise exception 'Nur eigene Entwürfe können geändert werden.';
    end if;
  end if;
  perform private.lock_user(new.user_id);
  if private.current_role(new.workspace_id) is null then raise exception 'Keine Berechtigung für diesen Workspace.' using errcode='42501'; end if;
  if new.minutes + coalesce((select sum(minutes) from public.time_entries where user_id=new.user_id and workspace_id=new.workspace_id and work_date=new.work_date and id<>new.id),0)>1440 then
    raise exception 'Pro Tag und Workspace sind höchstens 1440 Minuten erlaubt.';
  end if;
  if new.task_id is not null and not exists(select 1 from public.tasks t where t.workspace_id=new.workspace_id and t.id=new.task_id and t.project_id=new.project_id) then
    raise exception 'Die Aufgabe gehört nicht zum gewählten Projekt.';
  end if;
  -- Phase: gehört zum Projekt. Fehlt sie beim Anlegen, gilt die Phase, in deren Zeitraum der Tag liegt –
  -- aber nur, wenn das genau eine ist. So landen auch Timer, Vorschläge und Importe auf der richtigen Phase.
  if new.phase_id is not null and not exists(select 1 from public.project_phases ph where ph.workspace_id=new.workspace_id and ph.id=new.phase_id and ph.project_id=new.project_id) then
    raise exception 'Die Phase gehört nicht zum gewählten Projekt.';
  end if;
  if tg_op='INSERT' and new.phase_id is null then
    select case when count(*)=1 then (array_agg(ph.id))[1] end into new.phase_id from public.project_phases ph
    where ph.workspace_id=new.workspace_id and ph.project_id=new.project_id and ph.starts_on<=new.work_date and ph.ends_on>=new.work_date;
  end if;
  -- Leistungsart: fehlt sie beim Anlegen, gilt die Rolle, mit der die Person im Kapazitätsplan dieses Projekts steht.
  if tg_op='INSERT' and new.service_type_id is null then
    select case when count(distinct r.service_type_id)=1 then (array_agg(r.service_type_id))[1] end into new.service_type_id from public.capacity_rows r
    where r.workspace_id=new.workspace_id and r.project_id=new.project_id and r.user_id=new.user_id and r.service_type_id is not null;
  end if;
  -- Abrechenbar entscheidet das Projekt. Abweichen darf nur, wer Projekte oder die Zeiten des Teams bearbeitet.
  if tg_op='INSERT' or new.project_id is distinct from old.project_id or new.billable is distinct from old.billable then
    if not (private.can(new.workspace_id,'projects','edit') or private.can(new.workspace_id,'time_team','edit')) then
      select p.billable_default into new.billable from public.projects p where p.workspace_id=new.workspace_id and p.id=new.project_id;
      new.billable := coalesce(new.billable,true);
    end if;
  end if;
  return new;
end $$;
-- Die Regel läuft mit den Rechten der buchenden Person und fragt, ob gerade eine Demo aufgebaut wird.
grant execute on function private.demo_seeding(uuid) to authenticated;

-- Gebuchte Zeit je Projekt, Person und Woche (Ist neben dem Plan) sowie je Phase und Leistungsart.
-- Beide Sichten laufen mit den Rechten der aufrufenden Person.
create view public.capacity_actuals with (security_invoker=true) as
  select workspace_id, project_id, user_id, date_trunc('week',work_date)::date as week_start, sum(minutes)::integer as minutes
  from public.time_entries group by workspace_id, project_id, user_id, date_trunc('week',work_date)::date;
create view public.phase_effort with (security_invoker=true) as
  select workspace_id, project_id, phase_id, service_type_id, sum(minutes)::integer as minutes, (sum(minutes) filter (where billable))::integer as billable_minutes, count(*)::integer as entries
  from public.time_entries group by workspace_id, project_id, phase_id, service_type_id;
-- Summe je Planzeile über alle Wochen (die Oberfläche lädt nur den sichtbaren Ausschnitt) und geplante Zeit je Phase:
-- Eine Woche zählt zu der Phase, in der ihr Donnerstag liegt.
create view public.capacity_row_totals with (security_invoker=true) as
  select workspace_id, row_id, sum(minutes)::integer as minutes, min(week_start) as first_week, max(week_start) as last_week
  from public.capacity_cells group by workspace_id, row_id;
create view public.phase_plan with (security_invoker=true) as
  select ph.workspace_id, ph.project_id, ph.id as phase_id, coalesce(sum(c.minutes),0)::integer as minutes
  from public.project_phases ph
  left join public.capacity_rows r on r.workspace_id=ph.workspace_id and r.project_id=ph.project_id
  left join public.capacity_cells c on c.row_id=r.id and c.week_start+3 between ph.starts_on and ph.ends_on
  group by ph.workspace_id, ph.project_id, ph.id;
revoke all on public.capacity_actuals,public.phase_effort,public.capacity_row_totals,public.phase_plan from public,anon,authenticated;
grant select on public.capacity_actuals,public.phase_effort,public.capacity_row_totals,public.phase_plan to authenticated;

-- ---------------------------------------------------------------- Import eines ganzen Plans
-- Ein Aufruf, eine Transaktion: Leistungsarten, fehlende Projekte, Phasen, Zeilen und Wochenwerte.
-- „replace“ ersetzt den bisherigen Plan der enthaltenen Projekte, damit ein erneuter Import nichts verdoppelt.
create function public.import_capacity_plan(p_workspace_id uuid,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_replace boolean := coalesce((p_plan->>'replace')::boolean,true);
  v_project jsonb; v_row jsonb; v_phase jsonb; v_pid uuid; v_rid uuid; v_st uuid; v_name text; v_pos integer; v_rpos integer; v_count integer;
  n_projects integer:=0; n_created integer:=0; n_rows integer:=0; n_cells integer:=0; n_phases integer:=0; n_types integer:=0;
begin
  perform private.require_can(p_workspace_id,'planning','edit');
  if jsonb_typeof(p_plan->'projects') is distinct from 'array' or jsonb_array_length(p_plan->'projects') not between 1 and 200 then
    raise exception 'Der Plan enthält keine Projekte.';
  end if;
  for v_name in select distinct left(btrim(value),60) from jsonb_array_elements_text(case when jsonb_typeof(p_plan->'service_types')='array' then p_plan->'service_types' else '[]'::jsonb end) where btrim(value)<>'' loop
    insert into public.service_types(workspace_id,name,position)
    values(p_workspace_id,v_name,(select coalesce(max(position),0)+1 from public.service_types where workspace_id=p_workspace_id)) on conflict do nothing;
    get diagnostics v_count=row_count; n_types:=n_types+v_count;
  end loop;
  for v_project in select value from jsonb_array_elements(p_plan->'projects') loop
    v_pid := nullif(v_project->>'project_id','')::uuid;
    if v_pid is null then
      perform private.require_can(p_workspace_id,'projects','edit');
      insert into public.projects(workspace_id,code,name,client,budget_minutes)
      values(p_workspace_id,v_project->'create'->>'code',v_project->'create'->>'name',coalesce(v_project->'create'->>'client',''),coalesce((v_project->'create'->>'budget_minutes')::integer,0))
      returning id into v_pid;
      n_created := n_created+1;
    elsif not exists(select 1 from public.projects where workspace_id=p_workspace_id and id=v_pid) then
      raise exception 'Ein Projekt des Plans gehört nicht zu diesem Workspace.';
    elsif (v_project->>'budget_minutes') is not null and private.can(p_workspace_id,'projects','edit') then
      -- Angebotene Stunden aus dem Plan füllen ein leeres Zeitbudget, überschreiben aber keines.
      update public.projects set budget_minutes=(v_project->>'budget_minutes')::integer where workspace_id=p_workspace_id and id=v_pid and budget_minutes=0 and (v_project->>'budget_minutes')::integer>0;
    end if;
    if v_replace then delete from public.capacity_rows where workspace_id=p_workspace_id and project_id=v_pid; end if;
    select coalesce(max(position),0) into v_pos from public.project_phases where workspace_id=p_workspace_id and project_id=v_pid;
    for v_phase in select value from jsonb_array_elements(case when jsonb_typeof(v_project->'phases')='array' then v_project->'phases' else '[]'::jsonb end) loop
      v_pos := v_pos+1;
      insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on)
      values(p_workspace_id,v_pid,left(btrim(v_phase->>'name'),120),v_pos,nullif(v_phase->>'starts_on','')::date,nullif(v_phase->>'ends_on','')::date)
      on conflict (project_id,lower(btrim(name))) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on;
      n_phases := n_phases+1;
    end loop;
    select coalesce(max(position),0) into v_rpos from public.capacity_rows where workspace_id=p_workspace_id and project_id=v_pid;
    if jsonb_typeof(v_project->'rows')='array' and jsonb_array_length(v_project->'rows')>400 then raise exception 'Zu viele Zeilen in einem Projekt.'; end if;
    for v_row in select value from jsonb_array_elements(case when jsonb_typeof(v_project->'rows')='array' then v_project->'rows' else '[]'::jsonb end) loop
      v_st := null; v_rpos := v_rpos+1;
      if nullif(btrim(v_row->>'service_type'),'') is not null then
        select id into v_st from public.service_types where workspace_id=p_workspace_id and lower(btrim(name))=lower(left(btrim(v_row->>'service_type'),60));
      end if;
      insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,offered_minutes,note,position)
      values(p_workspace_id,v_pid,nullif(v_row->>'user_id','')::uuid,v_st,(v_row->>'offered_minutes')::integer,left(coalesce(v_row->>'note',''),240),v_rpos)
      returning id into v_rid;
      insert into public.capacity_cells(workspace_id,row_id,week_start,minutes)
      select p_workspace_id,v_rid,c.key::date,c.value::integer from jsonb_each_text(case when jsonb_typeof(v_row->'cells')='object' then v_row->'cells' else '{}'::jsonb end) c where c.value::integer>0;
      get diagnostics v_count=row_count; n_cells := n_cells+v_count; n_rows := n_rows+1;
    end loop;
    n_projects := n_projects+1;
  end loop;
  perform private.audit(p_workspace_id,'capacity_import','workspace',p_workspace_id,
    jsonb_build_object('projects',n_projects,'created_projects',n_created,'rows',n_rows,'cells',n_cells,'phases',n_phases,'service_types',n_types));
  return jsonb_build_object('projects',n_projects,'created_projects',n_created,'rows',n_rows,'cells',n_cells,'phases',n_phases,'service_types',n_types);
end $$;
revoke all on function public.import_capacity_plan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_capacity_plan(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------- Workspace löschen
do $patch$
declare def text:=pg_get_functiondef('private.delete_workspace(uuid,text,boolean)'::regprocedure); anchor text:=' delete from private.timer_receipts where workspace_id=p_workspace_id;';
begin
  if position(anchor in def)=0 then raise exception 'delete_workspace: unerwartete Fassung'; end if;
  execute replace(def,anchor,anchor||E'\n delete from public.capacity_cells where workspace_id=p_workspace_id;\n delete from public.capacity_rows where workspace_id=p_workspace_id;\n delete from public.project_phases where workspace_id=p_workspace_id;\n delete from public.service_types where workspace_id=p_workspace_id;');
end $patch$;

-- ---------------------------------------------------------------- Beispieldaten
-- Leistungsarten, Phasen für alle aktiven Projekte und ein Kapazitätsplan für die acht größten:
-- vierzehn Beispielpersonen, drei bis fünf je Projekt, mit freien und überbuchten Wochen.
-- Wiederholbar: vorhandene Werte bleiben, fehlende Wochen kommen dazu. Alle Zahlen sind fiktiv.
create function private.demo_seed_capacity(p_workspace_id uuid,p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); loc text; week date := date_trunc('week',p_today)::date;
  type_names text[]; phase_names text[]; types uuid[]; people uuid[]; owner_id uuid;
  pr record; rw record; i integer; k integer; j integer := 0; base date; cursor_day date; len integer; pid uuid; rid uuid; n integer := 0; d date; mins integer;
begin
  select locale into loc from public.workspace_demos where workspace_id=p_workspace_id;
  if loc is null then return 0; end if;
  type_names := case loc when 'de' then array['PM','CD','Konzept','3D','2D','Motion'] when 'zh' then array['项目管理','创意总监','概念','3D','2D','动效'] else array['PM','CD','Concept','3D','2D','Motion'] end;
  phase_names := case loc when 'de' then array['Discovery','Konzept','Entwurf','Produktionsbegleitung'] when 'zh' then array['需求探索','概念设计','方案设计','制作监理'] else array['Discovery','Concept design','Schematic design','Production supervision'] end;
  insert into public.service_types(workspace_id,name,position)
  select p_workspace_id,t.name,t.ord::integer from unnest(type_names) with ordinality t(name,ord) on conflict do nothing;
  select array_agg(s.id order by s.position,s.name) into types from public.service_types s where s.workspace_id=p_workspace_id and s.name=any(type_names);

  -- Phasen: vier aufeinanderfolgende Abschnitte von 3, 5, 5 und 6 Wochen, je Projekt versetzt,
  -- damit heute jedes Projekt in einer anderen Phase steht.
  for pr in select p.id,p.budget_minutes,(row_number() over (order by p.budget_minutes desc,p.code))::integer n from public.projects p
            where p.workspace_id=p_workspace_id and p.status='active'
              and not exists(select 1 from public.project_phases ph where ph.workspace_id=p_workspace_id and ph.project_id=p.id) loop
    base := week-63+((pr.n%4)*21);
    cursor_day := base;
    for i in 1..4 loop
      len := (array[3,5,5,6])[i]*7;
      insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on,budget_minutes)
      values(p_workspace_id,pr.id,phase_names[i],i,cursor_day,cursor_day+len-1,(round(pr.budget_minutes*(array[0.1,0.35,0.3,0.25])[i]/60.0)*60)::integer);
      cursor_day := cursor_day+len;
    end loop;
  end loop;

  select array_agg(x.user_id order by x.user_id) into people from (
    select m.user_id from public.memberships m where m.workspace_id=p_workspace_id and m.is_demo and m.role<>'disabled' order by m.user_id limit 14) x;
  select m.user_id into owner_id from public.memberships m where m.workspace_id=p_workspace_id and not m.is_demo and m.role='owner' and m.user_id=actor;
  if not exists(select 1 from public.capacity_rows where workspace_id=p_workspace_id) and coalesce(cardinality(people),0)>=5 then
    for pr in select p.id,(row_number() over (order by p.budget_minutes desc,p.code))::integer n,p.budget_minutes from public.projects p
              where p.workspace_id=p_workspace_id and p.status='active' order by p.budget_minutes desc,p.code limit 8 loop
      j := j+1;
      for k in 0..(2+(pr.n%3)) loop
        i := 1+((pr.n*3+k*5)%cardinality(people));
        insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,offered_minutes,position)
        values(p_workspace_id,pr.id,people[i],types[1+((i+k)%cardinality(types))],case when pr.budget_minutes>0 then (round(pr.budget_minutes/(3+(pr.n%3))/60.0)*60)::integer end,k+1);
      end loop;
      -- Eine Stelle ist noch offen: Bedarf, der noch niemandem gehört.
      if pr.n%4=2 then
        insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,note,position) values(p_workspace_id,pr.id,null,types[4],'',9);
      end if;
      -- Die angemeldete Person plant zwei Projekte als PM – so zeigt die eigene Buchung gleich Phase und Leistungsart.
      if owner_id is not null and j<=2 then
        insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,position) values(p_workspace_id,pr.id,owner_id,types[1],0);
      end if;
    end loop;
  end if;

  -- Wochenwerte: innerhalb der Phasen des Projekts, acht Wochen zurück bis zwanzig voraus.
  for rw in select r.id,r.user_id,r.position,(select min(ph.starts_on) from public.project_phases ph where ph.project_id=r.project_id) s,
                   (select max(ph.ends_on) from public.project_phases ph where ph.project_id=r.project_id) e,
                   abs(pg_catalog.hashtext(r.id::text)%1000) h
            from public.capacity_rows r where r.workspace_id=p_workspace_id loop
    if rw.s is null then continue; end if;
    d := greatest(date_trunc('week',rw.s)::date,week-56);
    while d<=least(rw.e,week+140) loop
      mins := case when rw.user_id is null then 960 when rw.position=0 then 480 else 60*(6+((rw.h+(d-date '2000-01-03')/7)%4)*4) end;
      if (rw.h+(d-date '2000-01-03')/7)%7<>0 then
        insert into public.capacity_cells(workspace_id,row_id,week_start,minutes) values(p_workspace_id,rw.id,d,mins) on conflict do nothing;
        get diagnostics k=row_count; n := n+k;
      end if;
      d := d+7;
    end loop;
  end loop;

  -- Bereits gebuchte Beispielzeiten der letzten Wochen bekommen Phase und Leistungsart nachgetragen.
  insert into private.demo_seed_context values(p_workspace_id,actor,txid_current())
  on conflict (workspace_id) do update set actor=excluded.actor,transaction_id=excluded.transaction_id;
  update public.time_entries e set
    phase_id=coalesce(e.phase_id,(select ph.id from public.project_phases ph where ph.workspace_id=e.workspace_id and ph.project_id=e.project_id and ph.starts_on<=e.work_date and ph.ends_on>=e.work_date order by ph.position limit 1)),
    service_type_id=coalesce(e.service_type_id,(select r.service_type_id from public.capacity_rows r where r.workspace_id=e.workspace_id and r.project_id=e.project_id and r.user_id=e.user_id and r.service_type_id is not null order by r.position limit 1))
  where e.workspace_id=p_workspace_id and e.work_date>=week-42 and (e.phase_id is null or e.service_type_id is null)
    and exists(select 1 from public.capacity_rows r where r.workspace_id=e.workspace_id and r.project_id=e.project_id);
  delete from private.demo_seed_context where workspace_id=p_workspace_id;
  return n;
end $$;
revoke all on function private.demo_seed_capacity(uuid,date) from public,anon,authenticated;

do $patch$
declare def text:=pg_get_functiondef('private.demo_refresh_workspace(uuid)'::regprocedure); anchor text:='  update public.workspace_demos set refreshed_on=today where workspace_id=p_workspace_id;';
begin
  if position(anchor in def)=0 then raise exception 'demo_refresh_workspace: unerwartete Fassung'; end if;
  execute replace(def,anchor,E'  perform private.demo_seed_capacity(p_workspace_id,today);\n'||anchor);
end $patch$;

-- Bestehende aktive Demos einmal auffrischen (als Ersteller:in der jeweiligen Demo, wie zuvor).
do $migration$
declare d record; previous text:=current_setting('request.jwt.claim.sub',true);
begin
  for d in select workspace_id,created_by from public.workspace_demos where archived_at is null and experience_version>=5 order by workspace_id loop
    begin
      perform set_config('request.jwt.claim.sub',d.created_by::text,true);
      perform private.demo_refresh_workspace(d.workspace_id);
    exception when others then
      raise notice 'Demo % nicht aufgefrischt: %',d.workspace_id,sqlerrm;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
end $migration$;
