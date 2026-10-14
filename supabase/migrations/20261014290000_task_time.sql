-- M5-A: Zeit auf Aufgaben buchbar — verbindet Board und Erfassung. Zeiteinträge
-- und laufende Timer tragen eine optionale Aufgabe desselben Projekts
-- (Composite-FK über den Workspace; Konsistenz Aufgabe↔Projekt erzwingt der
-- Entry-Guard bzw. start_timer). Wird eine Aufgabe gelöscht, bleibt die Zeit
-- erhalten und verliert nur die Referenz (ON DELETE SET NULL auf die Spalte):
-- der Entry-Guard lässt genau dieses System-Update — nichts als task_id→null,
-- nicht von anon/authenticated — ausdrücklich durch, denn die referentielle
-- Aktion läuft als Tabellen-Eigner und beträfe sonst auch fremde oder
-- freigegebene Einträge, die der Guard zu Recht sperrt.
alter table public.tasks add constraint tasks_workspace_id_id_key unique(workspace_id,id);
alter table public.time_entries add column task_id uuid;
alter table public.time_entries add constraint time_entries_task_fkey foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete set null (task_id);
create index time_entries_workspace_task on public.time_entries(workspace_id,task_id);
alter table public.running_timers add column task_id uuid;
alter table public.running_timers add constraint running_timers_task_fkey foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete set null (task_id);

-- Fassung aus 20261014191000_revoke_approval.sql plus: (1) System-Ausnahme für
-- die referentielle Aufgaben-Lösung, (2) Konsistenz Aufgabe↔Projekt.
create or replace function private.guard_entry() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Separate statements prevent SQL expression planning from checking the
  -- private helper's privileges during an ordinary browser write.
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
    -- Referentielle Aktion beim Löschen einer Aufgabe: nur task_id→null, vom
    -- Tabellen-Eigner ausgeführt — Zeit bleibt unverändert erhalten.
    if current_user not in ('anon','authenticated') and old.task_id is not null and new.task_id is null and (to_jsonb(new)-'task_id') is not distinct from (to_jsonb(old)-'task_id') then return new; end if;
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.timer_id is distinct from old.timer_id or new.created_at is distinct from old.created_at then
      raise exception 'Identität und Timer-Zuordnung sind unveränderlich.';
    end if;
    if new.status is distinct from old.status then
      if current_user in ('anon','authenticated') then raise exception 'Statuswechsel erfordern die Freigabe-Funktion.'; end if;
      if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'Ein Statuswechsel darf den Inhalt nicht verändern.'; end if;
      if old.status='draft' and new.status='submitted' and old.user_id=auth.uid() then null;
      elsif old.status='submitted' and new.status in ('draft','approved') and private.current_role(old.workspace_id) in ('owner','manager') then null;
      elsif old.status='approved' and new.status='draft' and private.current_role(old.workspace_id) in ('owner','manager') then null;
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
  if new.task_id is not null and not exists(select 1 from public.tasks t where t.workspace_id=new.workspace_id and t.id=new.task_id and t.project_id=new.project_id) then
    raise exception 'Die Aufgabe gehört nicht zum gewählten Projekt.';
  end if;
  return new;
end $$;

-- start_timer nimmt eine optionale Aufgabe; alte Clients ohne p_task_id treffen
-- über den Default weiter dieselbe Funktion.
drop function public.start_timer(uuid,uuid,text,boolean);
create function public.start_timer(p_workspace_id uuid,p_project_id uuid,p_note text,p_billable boolean,p_task_id uuid default null) returns public.running_timers
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=private.require_user(); v_timer public.running_timers;
begin
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner','manager','member']);
  select * into v_timer from public.running_timers where user_id=v_user for update;
  if found then
    if v_timer.workspace_id=p_workspace_id and v_timer.project_id=p_project_id and v_timer.note=p_note and v_timer.billable=p_billable and v_timer.task_id is not distinct from p_task_id then return v_timer; end if;
    raise exception 'Es läuft bereits ein Timer. Bitte zuerst stoppen oder verwerfen.';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and workspace_id=p_workspace_id and status='active') then raise exception 'Für Timer ist ein aktives Projekt im Workspace erforderlich.'; end if;
  if p_task_id is not null and not exists(select 1 from public.tasks t where t.workspace_id=p_workspace_id and t.id=p_task_id and t.project_id=p_project_id) then raise exception 'Die Aufgabe gehört nicht zum gewählten Projekt.'; end if;
  insert into public.running_timers(workspace_id,project_id,user_id,note,billable,task_id) values(p_workspace_id,p_project_id,v_user,p_note,p_billable,p_task_id) returning * into v_timer;
  perform private.audit(p_workspace_id,'start','timer',v_timer.id);
  return v_timer;
end $$;
revoke all on function public.start_timer(uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.start_timer(uuid,uuid,text,boolean,uuid) to authenticated;

-- stop_timer übernimmt die Aufgabe des Timers in die erzeugten Einträge.
create or replace function public.stop_timer(p_timer_id uuid) returns setof public.time_entries
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
      insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,timer_id,task_id)
      values(v_timer.workspace_id,v_timer.project_id,v_user,v_date,v_minutes,v_timer.note,v_timer.billable,v_timer.id,v_timer.task_id);
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
