-- Permanent deletion is a separate owner-only, explicitly confirmed operation.
-- This capability cannot be manufactured with request headers or set_config().
create table private.workspace_delete_context (
 workspace_id uuid primary key references public.workspaces(id),
 actor uuid not null,
 transaction_id bigint not null
);
alter table private.workspace_delete_context enable row level security;
revoke all on private.workspace_delete_context from public,anon,authenticated;

create function private.workspace_delete_allowed(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.workspace_delete_context c
 where c.workspace_id=p_workspace_id and c.actor=auth.uid() and c.transaction_id=txid_current())
$$;
revoke all on function private.workspace_delete_allowed(uuid) from public,anon,authenticated;

-- Keep all ordinary insert/update/delete protections. Only DELETE in the
-- authorized transaction can bypass these three row-level retention guards.
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

create or replace function private.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Separate statements prevent SQL expression planning from checking the
  -- private helper's privileges during an ordinary browser write.
  if tg_op='DELETE' then
    if current_user not in ('anon','authenticated') then
      if private.workspace_delete_allowed(old.workspace_id) then return old; end if;
    end if;
  end if;
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

create or replace function private.finance_guard_document() returns trigger language plpgsql set search_path='' as $$
begin
  -- Separate statements prevent SQL expression planning from checking the
  -- private helper's privileges during an ordinary browser write.
  if tg_op='DELETE' then
    if current_user not in ('anon','authenticated') then
      if private.workspace_delete_allowed(old.workspace_id) then return old; end if;
    end if;
  end if;
 if tg_op='DELETE' then raise exception 'FINANCE_CONFLICT'; end if;
 if tg_op='UPDATE' and (old.status<>'draft' or new.id<>old.id or new.workspace_id<>old.workspace_id or new.created_at<>old.created_at) then raise exception 'FINANCE_CONFLICT'; end if;
 if current_user in ('authenticated','anon') then raise exception 'FINANCE_FORBIDDEN' using errcode='42501'; end if;
 return new;
end $$;

-- Every timer insert, including real workspaces, takes the workspace key-share
-- lock before its final authorization check. Deletion takes FOR UPDATE before
-- checking timers: either a committed timer blocks deletion, or deletion wins
-- and the waiting timer start fails without losing previously running time.
create or replace function private.guard_demo_timer() returns trigger
language plpgsql set search_path='' as $$
begin
 perform 1 from public.workspaces where id=new.workspace_id for key share;
 if not found or private.current_role(new.workspace_id) is null then
  raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 return new;
end $$;

create function private.list_owned_workspaces() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=private.require_user(); v_result jsonb;
begin
 select coalesce(jsonb_agg(q.summary order by q.created_at,q.id),'[]'::jsonb) into v_result
 from (
  select w.id,w.created_at,jsonb_build_object(
   'id',w.id,'name',w.name,'created_at',w.created_at,
   'is_demo',d.workspace_id is not null,'archived_at',d.archived_at,
   'counts',jsonb_build_object(
    'projects',(select count(*) from public.projects p where p.workspace_id=w.id),
    'tasks',(select count(*) from public.tasks t where t.workspace_id=w.id),
    'time_entries',(select count(*) from public.time_entries e where e.workspace_id=w.id),
    'members',(select count(*) from public.memberships members where members.workspace_id=w.id),
    'invoices',(select count(*) from public.finance_invoices i where i.workspace_id=w.id),
    'expenses',(select count(*) from public.finance_expenses e where e.workspace_id=w.id)),
   'running_timers',(select count(*) from public.running_timers t where t.workspace_id=w.id)
  ) summary
  from public.memberships m join public.workspaces w on w.id=m.workspace_id
  left join public.workspace_demos d on d.workspace_id=w.id
  where m.user_id=v_user and m.auth_user_id=v_user and not m.is_demo and m.role='owner'
 ) q;
 return v_result;
end $$;

create function private.delete_workspace(p_workspace_id uuid,p_confirmation_name text,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_user(); v_workspace public.workspaces;
begin
 -- Avoid leaking names/counts/existence to callers with no owner membership.
 if not exists(select 1 from public.memberships where workspace_id=p_workspace_id
  and user_id=v_user and auth_user_id=v_user and not is_demo and role='owner') then
  raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 -- Consistent with archive/role/timer operations: actor -> workspace -> member.
 perform private.lock_user(v_user);
 select * into v_workspace from public.workspaces where id=p_workspace_id for update;
 if not found then raise exception 'WORKSPACE_ADMIN_NOT_FOUND'; end if;
 perform 1 from auth.users where id=v_user and email_confirmed_at is not null for share;
 if not found then raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.memberships where workspace_id=p_workspace_id and user_id=v_user
  and auth_user_id=v_user and not is_demo and role='owner' for update;
 if not found then raise exception 'WORKSPACE_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 -- Compare the stored spelling exactly; no trimming, case folding or Unicode normalization.
 if p_confirmed is distinct from true or p_confirmation_name is null
  or p_confirmation_name collate "C" is distinct from v_workspace.name collate "C" then
  raise exception 'WORKSPACE_ADMIN_CONFIRMATION';
 end if;
 if exists(select 1 from public.running_timers where workspace_id=p_workspace_id) then
  raise exception 'WORKSPACE_ADMIN_RUNNING_TIMERS';
 end if;
 insert into private.workspace_delete_context(workspace_id,actor,transaction_id)
 values(p_workspace_id,v_user,txid_current());
 -- Explicit dependency order. No trigger disabling, cascading auth deletion,
 -- session flag, dynamic SQL or retained copy of confidential business records.
 delete from public.finance_time_claims where workspace_id=p_workspace_id;
 delete from public.finance_payments where workspace_id=p_workspace_id;
 delete from public.finance_invoices where workspace_id=p_workspace_id;
 delete from public.finance_expenses where workspace_id=p_workspace_id;
 delete from public.finance_project_plans where workspace_id=p_workspace_id;
 delete from public.finance_staff_rates where workspace_id=p_workspace_id;
 delete from public.finance_billing_profiles where workspace_id=p_workspace_id;
 delete from public.finance_clients where workspace_id=p_workspace_id;
 delete from public.time_entries where workspace_id=p_workspace_id;
 delete from private.timer_receipts where workspace_id=p_workspace_id;
 delete from public.tasks where workspace_id=p_workspace_id;
 delete from public.projects where workspace_id=p_workspace_id;
 delete from public.invitations where workspace_id=p_workspace_id;
 delete from public.memberships where workspace_id=p_workspace_id;
 delete from private.demo_seed_context where workspace_id=p_workspace_id;
 delete from public.workspace_demos where workspace_id=p_workspace_id;
 delete from private.finance_number_counters where workspace_id=p_workspace_id;
 -- Ordinary audit triggers can run while the workspace still exists.
 delete from public.audit_log where workspace_id=p_workspace_id;
 delete from private.workspace_delete_context where workspace_id=p_workspace_id;
 delete from public.workspaces where id=p_workspace_id;
end $$;

create function public.list_owned_workspaces() returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_owned_workspaces()$$;
create function public.delete_workspace(p_workspace_id uuid,p_confirmation_name text,p_confirmed boolean) returns void
language sql volatile security invoker set search_path='' as $$select private.delete_workspace(p_workspace_id,p_confirmation_name,p_confirmed)$$;
revoke all on function private.list_owned_workspaces(),private.delete_workspace(uuid,text,boolean),public.list_owned_workspaces(),public.delete_workspace(uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.list_owned_workspaces(),private.delete_workspace(uuid,text,boolean),public.list_owned_workspaces(),public.delete_workspace(uuid,text,boolean) to authenticated;
