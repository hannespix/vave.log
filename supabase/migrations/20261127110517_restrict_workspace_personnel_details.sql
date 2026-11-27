-- Workspace membership allows reading the task board, team directory and absence calendar.
-- Ratings, personnel balances and absence notes require their own authorization.
-- Install scoped reads first, so a rolling app update can switch to them before
-- 20261127112202 removes legacy wide column grants.

-- An explicit rating write also requires the right when the value stays the same.
create function private.guard_task_rating_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.can(new.workspace_id, 'strengths', 'edit') then
    raise exception 'Die Bewertung vergibt nur die Leitung.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_task_rating_write() from public, anon, authenticated;
create trigger task_rating_write before update of rating on public.tasks
  for each row execute function private.guard_task_rating_write();

create function private.visible_membership(p_member public.memberships, p_show_hr boolean) returns public.memberships
language sql stable set search_path = '' as $$
  select case when p_show_hr then p_member else jsonb_populate_record(p_member,
    '{"vacation_days_per_year":null,"balance_start_on":null,"balance_start_minutes":null}'::jsonb) end
$$;
revoke all on function private.visible_membership(public.memberships, boolean) from public, anon, authenticated;

create function private.list_workspace_members(p_workspace_id uuid) returns setof public.memberships
language sql stable security definer set search_path = '' as $$
  select private.visible_membership(m, m.user_id = (select auth.uid())
      or (select private.can(p_workspace_id, 'absences_team', 'view')))
  from public.memberships m
  where m.workspace_id = p_workspace_id and (select private.current_role(p_workspace_id)) is not null
$$;

create function private.list_workspace_tasks(p_workspace_id uuid, p_offset integer, p_limit integer) returns setof public.tasks
language sql stable security definer set search_path = '' as $$
  select case when (select private.can(p_workspace_id, 'strengths', 'view')) then t
    else jsonb_populate_record(t, '{"rating":null}'::jsonb) end
  from public.tasks t
  where t.workspace_id = p_workspace_id and (select private.current_role(p_workspace_id)) is not null
  order by t.created_at, t.id
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 1000)
$$;

create function private.list_workspace_absences(p_workspace_id uuid, p_from date, p_to date) returns setof public.absences
language sql stable security definer set search_path = '' as $$
  select case when a.user_id = (select auth.uid()) or (select private.can(p_workspace_id, 'absences_team', 'view')) then a
    else jsonb_populate_record(a, '{"note":"","decided_by":null,"decided_at":null}'::jsonb) end
  from public.absences a
  where a.workspace_id = p_workspace_id and a.starts_on <= p_to and a.ends_on >= p_from
    and (select private.current_role(p_workspace_id)) is not null
$$;

create function public.list_workspace_members(p_workspace_id uuid) returns setof public.memberships
language sql stable security invoker set search_path = '' as $$
  select * from private.list_workspace_members(p_workspace_id)
$$;
create function public.list_workspace_tasks(p_workspace_id uuid, p_offset integer, p_limit integer) returns setof public.tasks
language sql stable security invoker set search_path = '' as $$
  select * from private.list_workspace_tasks(p_workspace_id, p_offset, p_limit)
$$;
create function public.list_workspace_absences(p_workspace_id uuid, p_from date, p_to date) returns setof public.absences
language sql stable security invoker set search_path = '' as $$
  select * from private.list_workspace_absences(p_workspace_id, p_from, p_to)
$$;

revoke all on function private.list_workspace_members(uuid), private.list_workspace_tasks(uuid, integer, integer),
  private.list_workspace_absences(uuid, date, date), public.list_workspace_members(uuid),
  public.list_workspace_tasks(uuid, integer, integer), public.list_workspace_absences(uuid, date, date)
  from public, anon, authenticated;
grant execute on function private.list_workspace_members(uuid), private.list_workspace_tasks(uuid, integer, integer),
  private.list_workspace_absences(uuid, date, date), public.list_workspace_members(uuid),
  public.list_workspace_tasks(uuid, integer, integer), public.list_workspace_absences(uuid, date, date)
  to authenticated;

-- Rights administration returns the same membership projection as the directory.
create or replace function public.set_member_rights(p_workspace_id uuid, p_user_id uuid, p_template text, p_permissions jsonb default null) returns public.memberships
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.memberships; v_own jsonb; v_new jsonb; v_old jsonb; v_key text; v_perm jsonb;
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
  v_old := private.rights_of(p_workspace_id,p_user_id);
  for v_key in select jsonb_object_keys(v_old) loop
    if private.level_rank(v_old->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Diese Person hat mehr Rechte als du. Ändern kann sie nur jemand mit diesen Rechten.' using errcode='42501'; end if;
  end loop;
  for v_key in select jsonb_object_keys(v_new) loop
    if private.level_rank(v_new->>v_key)>private.level_rank(v_own->>v_key) then raise exception 'Du kannst nur Rechte vergeben, die du selbst hast.' using errcode='42501'; end if;
  end loop;
  update public.memberships set rights_template=p_template, permissions=v_perm where workspace_id=p_workspace_id and user_id=p_user_id returning * into v_row;
  perform private.audit(p_workspace_id,'rights_change','membership',p_user_id,jsonb_build_object('rights_template',p_template,'permissions',v_perm));
  return private.visible_membership(v_row, private.can(p_workspace_id, 'absences_team', 'view'));
end $$;

-- Keep existing audit records intact and apply the same row scope to the HR events.
create policy audit_hr_details on public.audit_log as restrictive for select to authenticated
  using (action not in ('vacation_entitlement', 'work_schedule')
    or workspace_id in (select private.workspaces_with('absences_team', 'view')));

alter policy notifications_read on public.notifications using (
  user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces())
);
create or replace function public.mark_notifications_read(p_workspace_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_count integer;
begin
  perform private.lock_user(v_user);
  perform private.require_role(p_workspace_id, array['owner','manager','member']);
  update public.notifications set read_at = now()
  where workspace_id = p_workspace_id and user_id = v_user and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
