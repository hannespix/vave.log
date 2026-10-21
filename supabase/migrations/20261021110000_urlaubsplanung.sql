-- M8: Urlaubsplanung. Abwesenheiten bekommen einen Status (beantragt /
-- genehmigt / abgelehnt), halbe Tage und die Entscheidung; je Person gibt es
-- einen Jahresanspruch an Urlaubstagen und je Jahr Übertrag/Korrektur. Die
-- Regeln liegen in einem Trigger: Mitglieder beantragen für sich selbst (Krank
-- gilt sofort), die Leitung entscheidet und darf für alle eintragen. Jede
-- Entscheidung und jeder neue Antrag erzeugt eine In-App-Benachrichtigung.
alter table public.absences
  add column status text not null default 'approved' check (status in ('requested','approved','declined')),
  add column half_day text not null default '' check (half_day in ('','am','pm')),
  add column decided_by uuid,
  add column decided_at timestamptz,
  add constraint absences_half_day_single check (half_day='' or starts_on=ends_on);
create index absences_workspace_status on public.absences(workspace_id,status) where status='requested';
alter table public.workspaces add column absence_approval boolean not null default true;
alter table public.memberships add column vacation_days_per_year numeric(5,1) check (vacation_days_per_year is null or (vacation_days_per_year>=0 and vacation_days_per_year<=100));

-- Benachrichtigungsarten erweitern (die Prüfung heißt bei Postgres <tabelle>_<spalte>_check).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('entries_approved','entries_returned','absence_requested','absence_approved','absence_declined'));

create function private.notify(p_workspace_id uuid,p_user_id uuid,p_kind text,p_count integer) returns void
language plpgsql set search_path = '' as $$
begin
  if p_count is null or p_count<=0 or p_user_id is null or p_user_id=auth.uid() then return; end if;
  update public.notifications set entry_count=entry_count+p_count, created_at=now()
    where workspace_id=p_workspace_id and user_id=p_user_id and kind=p_kind and read_at is null;
  if not found then
    insert into public.notifications(workspace_id,user_id,kind,entry_count) values(p_workspace_id,p_user_id,p_kind,p_count);
  end if;
end $$;
revoke all on function private.notify(uuid,uuid,text,integer) from public,anon,authenticated;

create function private.absence_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text := private.current_role(new.workspace_id); v_manager boolean; v_approval boolean;
begin
  v_manager := v_role in ('owner','manager');
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
revoke all on function private.absence_rules() from public,anon,authenticated;
create trigger absence_rules before insert or update on public.absences for each row execute function private.absence_rules();

create function private.absence_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_manager record;
begin
  if tg_op='INSERT' and new.status='requested' then
    for v_manager in select user_id from public.memberships where workspace_id=new.workspace_id and role in ('owner','manager') loop
      perform private.notify(new.workspace_id,v_manager.user_id,'absence_requested',1);
    end loop;
  elsif tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('approved','declined') then
    perform private.notify(new.workspace_id,new.user_id,case when new.status='approved' then 'absence_approved' else 'absence_declined' end,1);
  end if;
  return new;
end $$;
revoke all on function private.absence_notify() from public,anon,authenticated;
create trigger absence_notify after insert or update on public.absences for each row execute function private.absence_notify();

-- Mitglieder löschen nur eigene offene Anträge und Krankmeldungen; die Leitung alles.
drop policy absences_delete on public.absences;
create policy absences_delete on public.absences for delete to authenticated using(private.current_role(workspace_id) in ('owner','manager') or (user_id=auth.uid() and private.current_role(workspace_id) is not null and (status='requested' or kind='sick')));

-- Jahresanspruch wie die Kapazität nur über die Definer-Funktion (Leitung).
create function public.set_vacation_entitlement(p_workspace_id uuid,p_user_id uuid,p_days numeric) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships;
begin
  perform private.require_user();
  if p_days is not null and (p_days<0 or p_days>100) then raise exception 'Der Urlaubsanspruch liegt zwischen 0 und 100 Tagen.'; end if;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  perform private.lock_user(p_user_id);
  perform private.require_role(p_workspace_id,array['owner','manager']);
  update public.memberships set vacation_days_per_year=p_days where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'vacation_entitlement','membership',p_user_id,jsonb_build_object('vacation_days_per_year',p_days));
  return v_row;
end $$;
revoke all on function public.set_vacation_entitlement(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.set_vacation_entitlement(uuid,uuid,numeric) to authenticated;

create function public.set_absence_approval(p_workspace_id uuid,p_required boolean) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.workspaces;
begin
  perform private.require_role(p_workspace_id,array['owner','manager']);
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id,array['owner','manager']);
  update public.workspaces set absence_approval=coalesce(p_required,true) where id=p_workspace_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Workspace nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'absence_approval','workspace',p_workspace_id,jsonb_build_object('absence_approval',coalesce(p_required,true)));
  return v_row;
end $$;
revoke all on function public.set_absence_approval(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_absence_approval(uuid,boolean) to authenticated;

-- Übertrag und Korrektur je Person und Jahr (Leitung schreibt, das Team liest).
create table public.vacation_balances (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  carried_over numeric(5,1) not null default 0 check (carried_over between -100 and 100),
  adjustment numeric(5,1) not null default 0 check (adjustment between -100 and 100),
  note text not null default '' check (length(note)<=300),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (workspace_id,user_id,year),
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id)
);
alter table public.vacation_balances enable row level security;
revoke all on public.vacation_balances from public,anon,authenticated;
grant select,insert,update,delete on public.vacation_balances to authenticated;
create policy vacation_balances_read on public.vacation_balances for select to authenticated using(private.current_role(workspace_id) is not null);
create policy vacation_balances_write on public.vacation_balances for insert to authenticated with check(private.current_role(workspace_id) in ('owner','manager'));
create policy vacation_balances_update on public.vacation_balances for update to authenticated using(private.current_role(workspace_id) in ('owner','manager')) with check(private.current_role(workspace_id) in ('owner','manager'));
create policy vacation_balances_delete on public.vacation_balances for delete to authenticated using(private.current_role(workspace_id) in ('owner','manager'));
