-- M5-B: Wochenkapazität je Person und Abwesenheiten — die Datengrundlage für
-- Auslastung und Kapazitätsplanung. Die Kapazität steht an der Mitgliedschaft
-- (null = unbekannt, 0 = ruht) und wird nur über die Definer-Funktion
-- gepflegt (memberships haben bewusst keine Schreib-Grants). Abwesenheiten
-- sieht das ganze Team (Planung); anlegen und löschen darf jede Person für
-- sich selbst, die Leitung für alle.
alter table public.memberships add column weekly_capacity_minutes integer check(weekly_capacity_minutes is null or weekly_capacity_minutes between 0 and 6000);

create function public.set_member_capacity(p_workspace_id uuid,p_user_id uuid,p_minutes integer) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_row public.memberships;
begin
  perform private.require_user();
  if p_minutes is not null and (p_minutes<0 or p_minutes>6000) then raise exception 'Die Wochenkapazität liegt zwischen 0 und 100 Stunden.'; end if;
  perform private.require_role(p_workspace_id,array['owner','manager']);
  perform private.lock_user(p_user_id);
  perform private.require_role(p_workspace_id,array['owner','manager']);
  update public.memberships set weekly_capacity_minutes=p_minutes where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  if not found then raise exception 'Keine Berechtigung oder Person nicht gefunden.' using errcode='42501'; end if;
  perform private.audit(p_workspace_id,'capacity','membership',p_user_id,jsonb_build_object('weekly_capacity_minutes',p_minutes));
  return v_row;
end $$;
revoke all on function public.set_member_capacity(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.set_member_capacity(uuid,uuid,integer) to authenticated;

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null default auth.uid(),
  starts_on date not null check (starts_on between date '2000-01-01' and date '2100-12-31'),
  ends_on date not null,
  kind text not null default 'vacation' check (kind in ('vacation','sick','holiday','other')),
  note text not null default '' check (length(note)<=500),
  created_at timestamptz not null default now(),
  check (ends_on>=starts_on and ends_on<=starts_on+366),
  foreign key (workspace_id,user_id) references public.memberships(workspace_id,user_id)
);
create index absences_workspace_user_date on public.absences(workspace_id,user_id,starts_on);
alter table public.absences enable row level security;
revoke all on public.absences from public,anon,authenticated;
grant select,insert,update,delete on public.absences to authenticated;
create policy absences_read on public.absences for select to authenticated using(private.current_role(workspace_id) is not null);
create policy absences_insert on public.absences for insert to authenticated with check(private.current_role(workspace_id) in ('owner','manager') or (user_id=auth.uid() and private.current_role(workspace_id) is not null));
create policy absences_update on public.absences for update to authenticated using(private.current_role(workspace_id) in ('owner','manager') or (user_id=auth.uid() and private.current_role(workspace_id) is not null)) with check(private.current_role(workspace_id) in ('owner','manager') or (user_id=auth.uid() and private.current_role(workspace_id) is not null));
create policy absences_delete on public.absences for delete to authenticated using(private.current_role(workspace_id) in ('owner','manager') or (user_id=auth.uid() and private.current_role(workspace_id) is not null));
-- Kein audit_data_change-Trigger: der generische Audit erwartet Status-Felder,
-- die Abwesenheiten nicht haben; Planungsdaten sind unkritisch und RLS-geschützt.
