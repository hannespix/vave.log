-- M16: Rechte je Konto. Statt drei Rollen (owner/manager/member) bekommt jede
-- Mitgliedschaft eine Rechte-Matrix je Modul (none/view/edit), vorbelegt durch
-- eine Vorlage. Owner behalten alles; bestehende manager/member laufen über
-- die Vorlagen „leitung“ bzw. „mitarbeit“ unverändert weiter. Policies und
-- Funktionen prüfen ab jetzt private.can(workspace, modul, stufe) statt der
-- Rolle; private.current_role bleibt die Mitgliedschaftsprüfung.

-- ---------------------------------------------------------------- Matrix
create function private.level_rank(p_level text) returns integer
language sql immutable set search_path = '' as $$
  select case p_level when 'edit' then 2 when 'view' then 1 else 0 end
$$;
revoke all on function private.level_rank(text) from public,anon,authenticated;

-- Vorlagen: Module projects, tasks, time_team, absences_team, planning, strengths, finance, team, settings.
-- projects/tasks: mindestens view (Basisrecht), planning: höchstens view, settings: none|edit.
create function private.template_rights(p_template text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_template
    when 'admin' then '{"projects":"edit","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"view","strengths":"edit","finance":"edit","team":"edit","settings":"edit"}'::jsonb
    when 'leitung' then '{"projects":"edit","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"view","strengths":"edit","finance":"edit","team":"view","settings":"edit"}'::jsonb
    when 'projektplanung' then '{"projects":"edit","tasks":"edit","time_team":"view","absences_team":"view","planning":"view","strengths":"view","finance":"none","team":"view","settings":"none"}'::jsonb
    when 'personal' then '{"projects":"view","tasks":"edit","time_team":"edit","absences_team":"edit","planning":"view","strengths":"edit","finance":"none","team":"edit","settings":"none"}'::jsonb
    when 'finanzen' then '{"projects":"view","tasks":"view","time_team":"view","absences_team":"none","planning":"none","strengths":"none","finance":"edit","team":"none","settings":"none"}'::jsonb
    when 'lesen' then '{"projects":"view","tasks":"view","time_team":"view","absences_team":"view","planning":"view","strengths":"view","finance":"view","team":"view","settings":"none"}'::jsonb
    else '{"projects":"view","tasks":"edit","time_team":"none","absences_team":"none","planning":"none","strengths":"none","finance":"none","team":"none","settings":"none"}'::jsonb
  end
$$;
revoke all on function private.template_rights(text) from public,anon,authenticated;

create function private.valid_permissions(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p)='object'
    and (select coalesce(bool_and(key in ('projects','tasks','time_team','absences_team','planning','strengths','finance','team','settings')),true) from jsonb_object_keys(p) key)
    and (select count(*) from jsonb_object_keys(p))=9
    and p->>'projects' in ('view','edit') and p->>'tasks' in ('view','edit')
    and p->>'time_team' in ('none','view','edit') and p->>'absences_team' in ('none','view','edit')
    and p->>'planning' in ('none','view') and p->>'strengths' in ('none','view','edit')
    and p->>'finance' in ('none','view','edit') and p->>'team' in ('none','view','edit')
    and p->>'settings' in ('none','edit')
$$;
revoke all on function private.valid_permissions(jsonb) from public,anon,authenticated;

alter table public.memberships
  add column rights_template text check (rights_template is null or rights_template in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen','individuell')),
  add column permissions jsonb check (permissions is null or private.valid_permissions(permissions));
alter table public.invitations
  add column rights_template text check (rights_template is null or rights_template in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen'));

-- Aufgelöste Matrix einer Mitgliedschaft (ohne Prüfung, wer fragt).
create function private.rights_of(p_workspace_id uuid,p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when m.role='owner' then private.template_rights('admin')
              when m.role in ('manager','member') then coalesce(m.permissions,private.template_rights(coalesce(m.rights_template,case when m.role='manager' then 'leitung' else 'mitarbeit' end)))
              else null end
  from public.memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and not m.is_demo
$$;
revoke all on function private.rights_of(uuid,uuid) from public,anon,authenticated;

-- Matrix der angemeldeten Person; null ohne aktive, bestätigte Mitgliedschaft.
create function private.rights(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.current_role(p_workspace_id) is null then null else private.rights_of(p_workspace_id,(select auth.uid())) end
$$;
revoke all on function private.rights(uuid) from public,anon,authenticated;
grant execute on function private.rights(uuid) to authenticated;

create function private.can(p_workspace_id uuid,p_module text,p_level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.level_rank(private.rights(p_workspace_id)->>p_module)>=private.level_rank(p_level),false)
$$;
revoke all on function private.can(uuid,text,text) from public,anon,authenticated;
grant execute on function private.can(uuid,text,text) to authenticated;

create function private.require_can(p_workspace_id uuid,p_module text,p_level text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.can(p_workspace_id,p_module,p_level) then
    raise exception 'Keine Berechtigung für diesen Bereich.' using errcode='42501';
  end if;
end $$;
revoke all on function private.require_can(uuid,text,text) from public,anon,authenticated;

-- ---------------------------------------------------------------- Policies
alter policy project_insert on public.projects with check (private.can(workspace_id,'projects','edit'));
alter policy project_update on public.projects using (private.can(workspace_id,'projects','edit')) with check (private.can(workspace_id,'projects','edit'));

alter policy task_insert on public.tasks with check (private.can(workspace_id,'tasks','edit') and created_by=(select auth.uid()));
alter policy task_update on public.tasks
  using (private.can(workspace_id,'tasks','edit') or (assignee_id=(select auth.uid()) and private.current_role(workspace_id) is not null))
  with check (private.can(workspace_id,'tasks','edit') or (assignee_id=(select auth.uid()) and private.current_role(workspace_id) is not null));
alter policy task_delete on public.tasks using (private.can(workspace_id,'tasks','edit'));

alter policy entry_read on public.time_entries using ((private.current_role(workspace_id) is not null and user_id=(select auth.uid())) or private.can(workspace_id,'time_team','view'));

alter policy absences_insert on public.absences with check (private.can(workspace_id,'absences_team','edit') or (user_id=auth.uid() and private.current_role(workspace_id) is not null));
alter policy absences_update on public.absences
  using (private.can(workspace_id,'absences_team','edit') or (user_id=auth.uid() and private.current_role(workspace_id) is not null))
  with check (private.can(workspace_id,'absences_team','edit') or (user_id=auth.uid() and private.current_role(workspace_id) is not null));
alter policy absences_delete on public.absences using (private.can(workspace_id,'absences_team','edit') or (user_id=auth.uid() and private.current_role(workspace_id) is not null and (status='requested' or kind='sick')));
alter policy vacation_balances_write on public.vacation_balances with check (private.can(workspace_id,'absences_team','edit'));
alter policy vacation_balances_update on public.vacation_balances using (private.can(workspace_id,'absences_team','edit')) with check (private.can(workspace_id,'absences_team','edit'));
alter policy vacation_balances_delete on public.vacation_balances using (private.can(workspace_id,'absences_team','edit'));

alter policy audit_read on public.audit_log using (private.can(workspace_id,'team','view'));

do $$ declare t text; begin
  foreach t in array array['finance_billing_profiles','finance_clients','finance_expenses','finance_invoice_payments','finance_invoices','finance_payments','finance_project_plans','finance_staff_rates','finance_time_claims'] loop
    execute format('alter policy finance_read on public.%I using (private.can(workspace_id,''finance'',''view''))',t);
  end loop;
  foreach t in array array['finance_clients','finance_expenses','finance_project_plans','finance_staff_rates'] loop
    execute format('alter policy finance_insert on public.%I with check (private.can(workspace_id,''finance'',''edit''))',t);
    execute format('alter policy finance_update on public.%I using (private.can(workspace_id,''finance'',''edit'')) with check (private.can(workspace_id,''finance'',''edit''))',t);
  end loop;
end $$;
alter policy finance_expense_delete on public.finance_expenses using (private.can(workspace_id,'finance','edit'));
alter policy finance_offers_read on public.finance_offers using (private.can(workspace_id,'finance','view'));

-- ---------------------------------------------------------------- Finanzen: Lesen mit „view“, Schreiben mit „edit“
create or replace function private.finance_require_manager(p_workspace_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can(p_workspace_id,'finance','edit') then raise exception 'FINANCE_FORBIDDEN' using errcode='42501'; end if;
end $$;
create function private.finance_require_view(p_workspace_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can(p_workspace_id,'finance','view') then raise exception 'FINANCE_FORBIDDEN' using errcode='42501'; end if;
end $$;
revoke all on function private.finance_require_view(uuid) from public,anon,authenticated;
create or replace function private.finance_list_invoices(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_view(p_workspace_id);
 if (select count(*) from public.finance_invoices where workspace_id=p_workspace_id)>1000 then raise exception 'FINANCE_LIMIT'; end if;
 return coalesce((
  select jsonb_agg(to_jsonb(i)||jsonb_build_object('paid',coalesce(p.paid,false),'cancellation_id',c.id,'paid_minor',coalesce(ip.paid_minor,0),'payments',coalesce(ip.payments,'[]'::jsonb)) order by i.created_at desc,i.id)
  from public.finance_invoices i
  left join public.finance_payments p on p.invoice_id=i.id
  left join public.finance_invoices c on c.cancellation_of=i.id
  left join lateral (select sum(x.amount_minor) as paid_minor,jsonb_agg(to_jsonb(x) order by x.paid_on,x.created_at,x.id) as payments from public.finance_invoice_payments x where x.invoice_id=i.id) ip on true
  where i.workspace_id=p_workspace_id),'[]');
end $$;
create or replace function private.finance_invoice_json(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 perform private.finance_require_view(p_workspace_id);
 select to_jsonb(i)||jsonb_build_object(
  'paid',coalesce((select paid from public.finance_payments where invoice_id=i.id),false),
  'cancellation_id',(select id from public.finance_invoices where cancellation_of=i.id),
  'paid_minor',coalesce((select sum(p.amount_minor) from public.finance_invoice_payments p where p.invoice_id=i.id),0),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on,p.created_at,p.id) from public.finance_invoice_payments p where p.invoice_id=i.id),'[]'))
 into v from public.finance_invoices i where i.workspace_id=p_workspace_id and i.id=p_id;
 if v is null then raise exception 'FINANCE_NOT_FOUND'; end if; return v;
end $$;
create or replace function private.finance_list_offers(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_view(p_workspace_id);
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('client_name',c.name) order by o.created_at desc,o.id)
  from public.finance_offers o join public.finance_clients c on c.workspace_id=o.workspace_id and c.id=o.client_id
  where o.workspace_id=p_workspace_id),'[]');
end $$;
create or replace function private.finance_offer_json(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.finance_require_view(p_workspace_id);
 select to_jsonb(o)||jsonb_build_object('client_name',c.name) into result
 from public.finance_offers o join public.finance_clients c on c.workspace_id=o.workspace_id and c.id=o.client_id
 where o.workspace_id=p_workspace_id and o.id=p_id;
 if result is null then raise exception 'FINANCE_NOT_FOUND'; end if;
 return result;
end $$;

-- ---------------------------------------------------------------- Zeiten des Teams
create or replace function public.review_entries(p_workspace_id uuid,p_ids uuid[],p_approve boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer:=0; v_user uuid; v_entry public.time_entries;
begin
  perform private.require_user();
  if p_approve is null or p_ids is null or array_length(p_ids,1) is null or array_length(p_ids,1)>500 then raise exception 'Freigabe-Entscheidung oder Auswahl fehlt (höchstens 500 Einträge je Lauf).'; end if;
  perform private.require_can(p_workspace_id,'time_team','edit');
  for v_user in select distinct user_id from public.time_entries where workspace_id=p_workspace_id and id=any(p_ids) order by 1 loop
    perform private.lock_user(v_user);
  end loop;
  perform private.require_can(p_workspace_id,'time_team','edit');
  for v_entry in select * from public.time_entries where workspace_id=p_workspace_id and id=any(p_ids) and status='submitted' order by id for update loop
    update public.time_entries set status=case when p_approve then 'approved' else 'draft' end where id=v_entry.id;
    perform private.audit(p_workspace_id,case when p_approve then 'approve' else 'return' end,'time_entry',v_entry.id);
    perform private.notify_review(p_workspace_id,v_entry.user_id,p_approve,1);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
create or replace function public.review_entry(p_id uuid,p_approve boolean) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.time_entries;
begin
  perform private.require_user();
  select * into v_entry from public.time_entries where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Eintrag nicht gefunden.' using errcode='42501'; end if;
  perform private.require_can(v_entry.workspace_id,'time_team','edit');
  perform private.lock_user(v_entry.user_id);
  perform private.require_can(v_entry.workspace_id,'time_team','edit');
  select * into v_entry from public.time_entries where id=p_id for update;
  if not found or v_entry.status<>'submitted' then raise exception 'Nur eingereichte Zeiten können geprüft werden.'; end if;
  if p_approve is null then raise exception 'Freigabe-Entscheidung fehlt.'; end if;
  update public.time_entries set status=case when p_approve then 'approved' else 'draft' end where id=p_id returning * into v_entry;
  perform private.audit(v_entry.workspace_id,case when p_approve then 'approve' else 'return' end,'time_entry',v_entry.id);
  perform private.notify_review(v_entry.workspace_id,v_entry.user_id,p_approve,1);
  return v_entry;
end $$;
create or replace function public.revoke_approval(p_id uuid) returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.time_entries;
begin
  perform private.require_user();
  select * into v_entry from public.time_entries where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Eintrag nicht gefunden.' using errcode='42501'; end if;
  perform private.require_can(v_entry.workspace_id,'time_team','edit');
  perform private.lock_user(v_entry.user_id);
  perform private.require_can(v_entry.workspace_id,'time_team','edit');
  select * into v_entry from public.time_entries where id=p_id for update;
  if not found or v_entry.status<>'approved' then raise exception 'Nur freigegebene Zeiten können zurückgeholt werden.'; end if;
  if exists(select 1 from public.finance_time_claims c where c.time_entry_id=v_entry.id) then
    raise exception 'Diese Zeit ist bereits fakturiert. Storniere zuerst die zugehörige Rechnung.';
  end if;
  update public.time_entries set status='draft' where id=p_id returning * into v_entry;
  perform private.audit(v_entry.workspace_id,'revoke_approval','time_entry',v_entry.id);
  perform private.notify_review(v_entry.workspace_id,v_entry.user_id,false,1);
  return v_entry;
end $$;
-- Statuswechsel im Trigger: Freigabe/Zurückweisung nur mit time_team:edit.
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
    if current_user not in ('anon','authenticated') and old.task_id is not null and new.task_id is null and (to_jsonb(new)-'task_id') is not distinct from (to_jsonb(old)-'task_id') then return new; end if;
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
  return new;
end $$;

-- ---------------------------------------------------------------- Abwesenheiten & Personal
create or replace function private.absence_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_manager boolean := private.can(new.workspace_id,'absences_team','edit'); v_approval boolean;
begin
  select absence_approval into v_approval from public.workspaces where id=new.workspace_id;
  if tg_op='INSERT' then
    if not v_manager then
      if new.user_id<>auth.uid() then raise exception 'Nur die Leitung trägt Abwesenheiten für andere ein.' using errcode='42501'; end if;
      new.status := case when new.kind='sick' or not coalesce(v_approval,true) then 'approved' else 'requested' end;
      new.decided_by := null; new.decided_at := null;
    elsif new.status='requested' then new.decided_by := null; new.decided_at := null;
    else new.decided_by := auth.uid(); new.decided_at := now(); end if;
  else
    if not v_manager then
      if old.status<>'requested' and old.kind<>'sick' then raise exception 'Entschiedene Abwesenheiten ändert nur die Leitung.' using errcode='42501'; end if;
      if new.user_id<>old.user_id then raise exception 'Die Person einer Abwesenheit lässt sich nicht ändern.' using errcode='42501'; end if;
      new.status := case when new.kind='sick' or not coalesce(v_approval,true) then 'approved' else 'requested' end;
      new.decided_by := null; new.decided_at := null;
    elsif new.status is distinct from old.status then
      if new.status='requested' then new.decided_by := null; new.decided_at := null;
      else new.decided_by := auth.uid(); new.decided_at := now(); end if;
    end if;
  end if;
  return new;
end $$;
create or replace function private.absence_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_manager record;
begin
  if tg_op='INSERT' and new.status='requested' then
    for v_manager in select m.user_id from public.memberships m where m.workspace_id=new.workspace_id and not m.is_demo and m.role in ('owner','manager','member')
      and private.level_rank(private.rights_of(new.workspace_id,m.user_id)->>'absences_team')>=2 loop
      perform private.notify(new.workspace_id,v_manager.user_id,'absence_requested',1);
    end loop;
  elsif tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('approved','declined') then
    perform private.notify(new.workspace_id,new.user_id,case when new.status='approved' then 'absence_approved' else 'absence_declined' end,1);
  end if;
  return new;
end $$;
create or replace function public.set_vacation_entitlement(p_workspace_id uuid,p_user_id uuid,p_days numeric) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships;
begin
  perform private.require_user();
  if p_days is not null and (p_days<0 or p_days>100) then raise exception 'Der Urlaubsanspruch liegt zwischen 0 und 100 Tagen.'; end if;
  perform private.require_can(p_workspace_id,'absences_team','edit');
  perform private.lock_user(p_user_id);
  perform private.require_can(p_workspace_id,'absences_team','edit');
  update public.memberships set vacation_days_per_year=p_days where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'vacation_entitlement','membership',p_user_id,jsonb_build_object('vacation_days_per_year',p_days));
  return v_row;
end $$;
create or replace function public.set_member_capacity(p_workspace_id uuid,p_user_id uuid,p_minutes integer) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships;
begin
  perform private.require_user();
  if p_minutes is not null and (p_minutes<0 or p_minutes>6000) then raise exception 'Die Wochenkapazität liegt zwischen 0 und 100 Stunden.'; end if;
  perform private.require_can(p_workspace_id,'absences_team','edit');
  perform private.lock_user(p_user_id);
  perform private.require_can(p_workspace_id,'absences_team','edit');
  update public.memberships set weekly_capacity_minutes=p_minutes where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'capacity','membership',p_user_id,jsonb_build_object('weekly_capacity_minutes',p_minutes));
  return v_row;
end $$;
create or replace function public.set_work_schedule(p_workspace_id uuid,p_user_id uuid,p_schedule jsonb,p_balance_start_on date,p_balance_start_minutes integer) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships; v_total integer;
begin
  perform private.require_user();
  if p_schedule is not null then
    if jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>7 then raise exception 'Das Arbeitszeitmodell braucht sieben Tageswerte (Montag bis Sonntag).'; end if;
    select sum((e::text)::numeric)::integer into v_total from jsonb_array_elements(p_schedule) e;
    if v_total<0 or v_total>6000 then raise exception 'Die Wochenkapazität liegt zwischen 0 und 100 Stunden.'; end if;
  end if;
  if p_balance_start_minutes is not null and (p_balance_start_minutes<-600000 or p_balance_start_minutes>600000) then raise exception 'Der Startsaldo liegt zwischen -10.000 und 10.000 Stunden.'; end if;
  perform private.require_can(p_workspace_id,'absences_team','edit');
  perform private.lock_user(p_user_id);
  perform private.require_can(p_workspace_id,'absences_team','edit');
  update public.memberships set work_schedule=p_schedule, weekly_capacity_minutes=coalesce(v_total,weekly_capacity_minutes), balance_start_on=p_balance_start_on, balance_start_minutes=coalesce(p_balance_start_minutes,0)
    where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'work_schedule','membership',p_user_id,jsonb_build_object('work_schedule',p_schedule,'balance_start_on',p_balance_start_on,'balance_start_minutes',coalesce(p_balance_start_minutes,0)));
  return v_row;
end $$;
create or replace function public.set_member_location(p_workspace_id uuid,p_user_id uuid,p_location text) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_location text := nullif(btrim(coalesce(p_location,'')),''); v_row public.memberships;
begin
  if v_location is not null and v_location !~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then raise exception 'Der Standort braucht die Form LAND oder LAND-REGION (z. B. DE-BW).'; end if;
  if p_user_id<>v_user then perform private.require_can(p_workspace_id,'absences_team','edit'); end if;
  perform private.lock_user(p_user_id);
  if p_user_id<>v_user then perform private.require_can(p_workspace_id,'absences_team','edit'); end if;
  update public.memberships set location=v_location where workspace_id=p_workspace_id and user_id=p_user_id and (p_user_id<>v_user or role<>'disabled') returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'location','membership',p_user_id,jsonb_build_object('location',v_location));
  return v_row;
end $$;

-- ---------------------------------------------------------------- Workspace-Einstellungen
create or replace function public.set_absence_approval(p_workspace_id uuid,p_required boolean) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.workspaces;
begin
  perform private.require_can(p_workspace_id,'settings','edit');
  perform private.lock_user(v_user);
  perform private.require_can(p_workspace_id,'settings','edit');
  update public.workspaces set absence_approval=coalesce(p_required,true) where id=p_workspace_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Workspace nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'absence_approval','workspace',p_workspace_id,jsonb_build_object('absence_approval',coalesce(p_required,true)));
  return v_row;
end $$;
create or replace function public.set_workspace_location(p_workspace_id uuid,p_location text) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_location text := nullif(btrim(coalesce(p_location,'')),''); v_row public.workspaces;
begin
  if v_location is not null and v_location !~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then raise exception 'Der Standort braucht die Form LAND oder LAND-REGION (z. B. DE-BW).'; end if;
  perform private.require_can(p_workspace_id,'settings','edit');
  perform private.lock_user(v_user);
  perform private.require_can(p_workspace_id,'settings','edit');
  update public.workspaces set default_location=v_location where id=p_workspace_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Workspace nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'location','workspace',p_workspace_id,jsonb_build_object('default_location',v_location));
  return v_row;
end $$;

-- ---------------------------------------------------------------- Planung & Stärken
create or replace function public.project_insight(p_workspace_id uuid,p_project_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_project public.projects; v_timezone text; v_today date; v_result jsonb;
begin
  if auth.uid() is null or not private.can(p_workspace_id,'planning','view') then
    raise exception 'Project insight is unavailable.' using errcode='42501';
  end if;
  select p.* into v_project from public.projects p where p.workspace_id=p_workspace_id and p.id=p_project_id;
  select w.timezone into v_timezone from public.workspaces w where w.id=p_workspace_id;
  if v_project.id is null or v_timezone is null then raise exception 'Project insight is unavailable.' using errcode='42501'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  with daily as materialized (
    select e.work_date,sum(e.minutes)::bigint minutes from public.time_entries e
    where e.workspace_id=p_workspace_id and e.project_id=p_project_id and e.work_date<=v_today group by e.work_date
  ), task_rows as materialized (
    select t.id,t.title,t.status,t.due_date,t.assignee_id,t.estimated_minutes,t.is_milestone from public.tasks t
    where t.workspace_id=p_workspace_id and t.project_id=p_project_id
  ), task_counts as (
    select count(*) total,count(*) filter(where t.status='done') done,count(*) filter(where t.status='doing') doing,
      count(*) filter(where t.status<>'done' and t.due_date<v_today) overdue,
      count(*) filter(where t.estimated_minutes is not null) estimated,
      coalesce(sum(t.estimated_minutes),0) estimated_minutes,
      coalesce(sum(t.estimated_minutes) filter(where t.status='done'),0) done_estimated_minutes,
      count(*) filter(where t.estimated_minutes is null) missing_estimates,
      count(*) filter(where t.due_date is null) missing_due_dates,
      count(*) filter(where t.assignee_id is null) unassigned
    from task_rows t
  ), milestone_counts as (
    select count(*) total,count(*) filter(where t.status='done') done,
      count(*) filter(where t.status<>'done' and t.due_date<v_today) overdue,
      count(*) filter(where t.due_date is null) missing_due_dates from task_rows t where t.is_milestone
  ), milestone_items as (
    select t.id,t.title,t.status,t.due_date from task_rows t where t.is_milestone
    order by (t.status='done'),t.due_date nulls last,t.title,t.id limit 12
  )
  select jsonb_build_object(
    'project',to_jsonb(v_project),'as_of',v_today,'progress_date',(v_project.progress_updated_at at time zone v_timezone)::date,
    'total_minutes',coalesce((select sum(d.minutes) from daily d),0),
    'first_work_date',(select min(d.work_date) from daily d),'last_work_date',(select max(d.work_date) from daily d),
    'recent_daily',coalesce((select jsonb_agg(jsonb_build_object('work_date',d.work_date,'minutes',d.minutes) order by d.work_date)
      from daily d where d.work_date>=v_today-27),'[]'::jsonb),
    'tasks',(select to_jsonb(t) from task_counts t),
    'milestones',(select to_jsonb(m) from milestone_counts m)||jsonb_build_object('items',
      coalesce((select jsonb_agg(to_jsonb(i) order by (i.status='done'),i.due_date nulls last,i.title,i.id) from milestone_items i),'[]'::jsonb))
  ) into v_result;
  return v_result;
end $$;
create or replace function private.task_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.started_at := case when new.status in ('doing','done') then now() else null end;
    new.done_at := case when new.status='done' then now() else null end;
    new.reopened_count := 0;
    if new.rating is not null and not private.can(new.workspace_id,'strengths','edit') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
    return new;
  end if;
  new.started_at := old.started_at; new.done_at := old.done_at; new.reopened_count := old.reopened_count;
  if new.status is distinct from old.status then
    if new.status in ('doing','done') and new.started_at is null then new.started_at := now(); end if;
    if new.status='done' then new.done_at := now();
    elsif old.status='done' then new.done_at := null; new.reopened_count := old.reopened_count+1; end if;
  end if;
  if new.rating is distinct from old.rating and not private.can(new.workspace_id,'strengths','edit') then raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode='42501'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- Team: Einladungen und Rechte
drop function public.invite_member(uuid,text,text);
create function public.invite_member(p_workspace_id uuid,p_email text,p_role text,p_template text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email)); v_own jsonb; v_new jsonb; v_key text;
begin
  perform private.require_can(p_workspace_id,'team','edit');
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Ungültige E-Mail-Adresse.'; end if;
  if p_role is null or p_role not in ('manager','member') then raise exception 'Ungültige Rolle: Einladungen erlauben nur Manager oder Mitglied.'; end if;
  if p_template is not null and p_template not in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen') then raise exception 'Unbekannte Rechte-Vorlage.'; end if;
  -- Niemand lädt mit mehr Rechten ein, als er selbst hat.
  v_own := private.rights(p_workspace_id);
  v_new := private.template_rights(coalesce(p_template,case when p_role='manager' then 'leitung' else 'mitarbeit' end));
  for v_key in select jsonb_object_keys(v_new) loop
    if private.level_rank(v_new->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Du kannst nur Rechte vergeben, die du selbst hast.' using errcode='42501'; end if;
  end loop;
  delete from public.invitations where workspace_id=p_workspace_id and expires_at<=now();
  if exists(select 1 from public.memberships where workspace_id=p_workspace_id and email=v_email) then
    raise exception 'Diese E-Mail-Adresse gehört bereits zu einem Mitglied dieses Workspace. Passe stattdessen die Rechte unter Team an.';
  end if;
  insert into public.invitations(workspace_id,email,role,rights_template,invited_by) values(p_workspace_id,v_email,p_role,p_template,auth.uid())
  on conflict(workspace_id,email) do update set role=excluded.role,rights_template=excluded.rights_template,invited_by=excluded.invited_by,created_at=now(),expires_at=now()+interval '14 days'
  returning id into v_id;
  perform private.audit(p_workspace_id,'invite','invitation',v_id,jsonb_build_object('role',p_role,'rights_template',p_template));
end $$;
revoke all on function public.invite_member(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.invite_member(uuid,text,text,text) to authenticated;
create or replace function public.accept_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_email text; v_name text; v_inv public.invitations; v_count integer:=0; v_added integer;
begin
  select lower(email),left(coalesce(nullif(raw_user_meta_data->>'display_name',''),split_part(email,'@',1)),120) into v_email,v_name from auth.users where id=v_user and email_confirmed_at is not null;
  delete from public.invitations where email=v_email and expires_at<=now();
  for v_inv in select * from public.invitations where email=v_email and expires_at>now() order by workspace_id for update loop
    insert into public.memberships(workspace_id,user_id,role,display_name,email,rights_template) values(v_inv.workspace_id,v_user,v_inv.role,v_name,v_email,v_inv.rights_template) on conflict(workspace_id,user_id) do nothing;
    get diagnostics v_added = row_count;
    v_count:=v_count+v_added;
    delete from public.invitations where id=v_inv.id;
    perform private.audit(v_inv.workspace_id,'accept','invitation',v_inv.id);
  end loop;
  return v_count;
end $$;
create or replace function public.list_invitations(p_workspace_id uuid) returns setof public.invitations
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_can(p_workspace_id,'team','view');
  return query select * from public.invitations where workspace_id=p_workspace_id and expires_at>now() order by created_at desc,id;
end $$;
create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  perform private.require_user();
  select * into v_inv from public.invitations where id=p_id;
  if not found then raise exception 'Keine Berechtigung oder Einladung nicht gefunden.' using errcode='42501'; end if;
  perform private.require_can(v_inv.workspace_id,'team','edit');
  delete from public.invitations where id=p_id;
  perform private.audit(v_inv.workspace_id,'revoke','invitation',p_id,jsonb_build_object('role',v_inv.role));
end $$;
-- Rollenwechsel (nur Owner) setzt die Rechte auf die Vorgabe der Rolle zurück.
create or replace function public.set_member_role(p_workspace_id uuid,p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_timer public.running_timers;
begin
  perform private.require_role(p_workspace_id,array['owner']);
  if p_role is null or p_role not in ('owner','manager','member','disabled') then raise exception 'Ungültige Rolle.'; end if;
  perform private.lock_user(p_user_id);
  perform 1 from public.workspaces where id=p_workspace_id for update;
  perform private.require_role(p_workspace_id,array['owner']);
  update public.memberships set role=p_role, rights_template=null, permissions=null where workspace_id=p_workspace_id and user_id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if p_role='disabled' then
    delete from public.running_timers where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_timer;
    if found then perform private.audit(p_workspace_id,'discard_on_disable','timer',v_timer.id); end if;
  end if;
  perform private.audit(p_workspace_id,'role_change','membership',p_user_id,jsonb_build_object('role',p_role));
end $$;
-- Rechte setzen: Vorlage oder individuelle Matrix. Nie auf Owner, nie auf sich
-- selbst, nie mehr als die eigenen Rechte.
create function public.set_member_rights(p_workspace_id uuid,p_user_id uuid,p_template text,p_permissions jsonb default null) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.memberships; v_own jsonb; v_new jsonb; v_key text; v_perm jsonb;
begin
  perform private.require_can(p_workspace_id,'team','edit');
  if p_template is null or p_template not in ('admin','leitung','projektplanung','personal','finanzen','mitarbeit','lesen','individuell') then raise exception 'Unbekannte Rechte-Vorlage.'; end if;
  if p_user_id=v_user then raise exception 'Die eigenen Rechte ändert eine andere Person mit Teamrecht.' using errcode='42501'; end if;
  if p_template='individuell' then
    if p_permissions is null or not private.valid_permissions(p_permissions) then raise exception 'Die Rechte-Matrix ist unvollständig oder enthält unbekannte Werte.'; end if;
    v_perm := p_permissions; v_new := p_permissions;
  else
    v_perm := null; v_new := private.template_rights(p_template);
  end if;
  perform private.lock_user(p_user_id);
  perform private.require_can(p_workspace_id,'team','edit');
  select * into v_row from public.memberships where workspace_id=p_workspace_id and user_id=p_user_id and not is_demo for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_row.role='owner' then raise exception 'Owner haben alle Rechte; die Rolle ändert nur ein Owner.' using errcode='42501'; end if;
  if v_row.role='disabled' then raise exception 'Diese Person ist deaktiviert.'; end if;
  v_own := private.rights(p_workspace_id);
  for v_key in select jsonb_object_keys(v_new) loop
    if private.level_rank(v_new->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Du kannst nur Rechte vergeben, die du selbst hast.' using errcode='42501'; end if;
  end loop;
  update public.memberships set rights_template=p_template, permissions=v_perm where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  perform private.audit(p_workspace_id,'rights_change','membership',p_user_id,jsonb_build_object('rights_template',p_template,'permissions',v_perm));
  return v_row;
end $$;
revoke all on function public.set_member_rights(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_member_rights(uuid,uuid,text,jsonb) to authenticated;
