-- Add planning without inventing progress or changing existing/demo business values.
alter table public.projects
  add column due_date date check (due_date is null or due_date between date '2000-01-01' and date '2100-12-31'),
  add column progress_percent numeric check (progress_percent is null or progress_percent between 0 and 100),
  add column progress_updated_at timestamptz;

-- Table grants include all columns, so enforce ownership of the timestamp even
-- for direct REST/SQL callers. Omitted planning in legacy updates stays intact.
create function private.guard_project_progress() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.progress_updated_at is not null then
      raise exception 'Project progress timestamp is server managed.' using errcode='42501';
    end if;
    new.progress_updated_at := case when new.progress_percent is not null then clock_timestamp() else null end;
  else
    if new.progress_updated_at is distinct from old.progress_updated_at then
      raise exception 'Project progress timestamp is server managed.' using errcode='42501';
    end if;
    if new.progress_percent is distinct from old.progress_percent then
      new.progress_updated_at := case when new.progress_percent is not null then clock_timestamp() else null end;
    else
      new.progress_updated_at := old.progress_updated_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_project_progress() from public,anon,authenticated;
create trigger project_progress_guard before insert or update on public.projects
  for each row execute function private.guard_project_progress();

-- STABLE uses the calling statement's snapshot for authorization and all facts.
-- Invoker privileges retain RLS; the explicit role guard prevents members from
-- accidentally receiving an own-time partial aggregate presented as a team total.
create function public.project_insight(p_workspace_id uuid,p_project_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
  v_project public.projects;
  v_timezone text;
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(private.current_role(p_workspace_id) in ('owner','manager'),false) then
    raise exception 'Project insight is unavailable.' using errcode='42501';
  end if;
  select p.* into v_project from public.projects p
    where p.workspace_id=p_workspace_id and p.id=p_project_id;
  select w.timezone into v_timezone from public.workspaces w where w.id=p_workspace_id;
  if v_project.id is null or v_timezone is null then
    raise exception 'Project insight is unavailable.' using errcode='42501';
  end if;
  v_today := (now() at time zone v_timezone)::date;
  with daily as materialized (
    select e.work_date,sum(e.minutes)::bigint minutes
    from public.time_entries e
    where e.workspace_id=p_workspace_id and e.project_id=p_project_id and e.work_date<=v_today
    group by e.work_date
  ), task_counts as (
    select count(*) total,count(*) filter(where t.status='done') done,
      count(*) filter(where t.status<>'done' and t.due_date<v_today) overdue
    from public.tasks t where t.workspace_id=p_workspace_id and t.project_id=p_project_id
  )
  select jsonb_build_object(
    'project',to_jsonb(v_project),
    'as_of',v_today,
    'progress_date',(v_project.progress_updated_at at time zone v_timezone)::date,
    'total_minutes',coalesce((select sum(d.minutes) from daily d),0),
    'first_work_date',(select min(d.work_date) from daily d),
    'last_work_date',(select max(d.work_date) from daily d),
    'recent_daily',coalesce((select jsonb_agg(jsonb_build_object('work_date',d.work_date,'minutes',d.minutes) order by d.work_date)
      from daily d where d.work_date>=v_today-27),'[]'::jsonb),
    'tasks',(select to_jsonb(t) from task_counts t)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.project_insight(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_insight(uuid,uuid) to authenticated;
