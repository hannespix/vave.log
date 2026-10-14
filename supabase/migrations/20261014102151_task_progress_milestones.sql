-- Task estimates support automatic progress from completed planned effort.
-- Existing RLS, membership roles and identity guards apply to the new fields.
alter table public.tasks
  add column estimated_minutes integer check(estimated_minutes is null or estimated_minutes between 1 and 6000000),
  add column is_milestone boolean not null default false;

-- Keep the same role boundary, RLS, snapshot and all-history effort semantics.
-- Milestones are a subset of tasks and are never added to the task totals twice.
create or replace function public.project_insight(p_workspace_id uuid,p_project_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_project public.projects; v_timezone text; v_today date; v_result jsonb;
begin
  if auth.uid() is null or not coalesce(private.current_role(p_workspace_id) in ('owner','manager'),false) then
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
revoke all on function public.project_insight(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_insight(uuid,uuid) to authenticated;

alter table public.workspace_demos drop constraint workspace_demos_experience_version_check;
alter table public.workspace_demos add constraint workspace_demos_experience_version_check check(experience_version in (1,2,3,4,5));

-- Private invoker helper. Only untouched original seed tasks are candidates;
-- familiar names on later user tasks do not establish seed provenance.
create function private.demo_seed_task_planning(p_workspace_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare
  w public.workspaces; d public.workspace_demos; p record; t record;
  today date; used numeric; target_percent numeric; planned bigint; done_pool bigint; pending_pool bigint;
  task_count integer; done_count integer; pending_count integer; minutes integer;
  changed integer:=0; affected integer; owner_task_title text;
begin
  select * into w from public.workspaces where id=p_workspace_id for update;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
  if w.id is null or d.workspace_id is null or d.archived_at is not null then return 0; end if;
  today:=(now() at time zone w.timezone)::date;
  owner_task_title:=case d.locale when 'de' then 'Demo: Konzept und Umsetzung' when 'zh' then '演示：概念与实施' else 'Demo: Concept and delivery' end;
  for p in
    with seeds as (
      select value,1 stage from jsonb_array_elements(private.demo_manifest()->'projects')
      union all select value,case when n<=5 then 2 else 3 end
      from jsonb_array_elements(private.demo_manifest()->'fictional_projects') with ordinality f(value,n)
    )
    select project.*,s.value->>'code' seed_code,s.stage
    from public.projects project join seeds s
      on (project.code=s.value->>'code' or project.code ~ ('^'||(s.value->>'code')||'-[a-f0-9]{8}$'))
      and project.name=s.value->>'name' and project.client=s.value->>'client'
    where project.workspace_id=p_workspace_id
      and exists(select 1 from public.audit_log a where a.workspace_id=p_workspace_id and a.entity_type='project'
        and a.entity_id=project.id and a.action='create' and a.actor_id=d.created_by and a.created_at=project.created_at)
      and exists(select 1 from public.audit_log a where a.workspace_id=p_workspace_id and a.entity_type='workspace'
        and a.entity_id=p_workspace_id and a.actor_id=d.created_by and a.created_at=project.created_at
        and ((s.stage=1 and a.action='demo_create') or (s.stage>1 and a.action='demo_upgrade' and a.details->>'experience_version'=s.stage::text)))
      and exists(select 1 from public.finance_project_plans plan
        join public.finance_clients client on client.workspace_id=plan.workspace_id and client.id=plan.client_id
        where plan.workspace_id=p_workspace_id and plan.project_id=project.id
        and plan.created_at=project.created_at and client.created_at=project.created_at)
      and exists(select 1 from public.time_entries e where e.workspace_id=p_workspace_id and e.project_id=project.id and e.created_at=project.created_at
        and e.note in ('Fictional demo time; not actual project work','Fiktive Demozeit; keine tatsächliche Projektleistung','虚构演示工时；并非真实项目工作',
          'Fictional demo time — not actual project work','Fiktive Demozeit — keine echte Projektleistung','虚构演示工时 — 并非真实项目工作',
          'Fictional demo time — international client delivery','Fiktive Demozeit — internationale Kundenprojekte','虚构演示工时 — 国际客户项目'))
    for update of project
  loop
    -- Serialize against task edits before selecting weights and preserve every
    -- prior user edit, including an explicitly cleared estimate or milestone.
    perform 1 from public.tasks where workspace_id=p_workspace_id and project_id=p.id for update;
    select count(*),count(*) filter(where status='done') into task_count,done_count
      from public.tasks where workspace_id=p_workspace_id and project_id=p.id;
    if task_count=0 then continue; end if;
    pending_count:=task_count-done_count;
    select coalesce(sum(e.minutes),0) into used from public.time_entries e
      where e.workspace_id=p_workspace_id and e.project_id=p.id and e.work_date<=today;
    target_percent:=case
      when p.stage=1 then 95 when p.seed_code='MOVE26' then 35 when p.status='paused' then 40
      when p.status='archived' then 35
      when p.seed_code='AERO26' and p.budget_minutes>0 then greatest(1,least(95,floor(used*100/(p.budget_minutes*1.15))))
      when p.budget_minutes>0 then greatest(1,least(95,ceil(used*100/(p.budget_minutes*0.85)))) else 35 end;
    planned:=greatest(task_count,least(task_count::bigint*6000000,case when p.budget_minutes>0 then p.budget_minutes else task_count*480 end));
    done_pool:=case when done_count=0 then 0 when pending_count=0 then planned
      else greatest(done_count,least(planned-pending_count,round(planned*target_percent/100)::bigint)) end;
    pending_pool:=planned-done_pool;
    for t in
      with original as (
        select task.*,count(*) over(partition by task.title) title_count,
          task.title=private.demo_manifest()->'phases'->2->>d.locale production_phase
        from public.tasks task
        where task.workspace_id=p_workspace_id and task.project_id=p.id and task.created_by=d.created_by
          and (exists(select 1 from jsonb_array_elements(private.demo_manifest()->'phases') phase where phase->>d.locale=task.title)
            or (p.seed_code in ('TIDE26','MOVE26','THREAD26') and task.title=owner_task_title))
          and exists(select 1 from public.audit_log a where a.workspace_id=p_workspace_id and a.entity_type='task' and a.entity_id=task.id
            and a.action='create' and a.actor_id=d.created_by and a.created_at=task.created_at)
          and exists(select 1 from public.audit_log a where a.workspace_id=p_workspace_id and a.entity_type='workspace' and a.entity_id=p_workspace_id
            and a.actor_id=d.created_by and a.created_at=task.created_at
            and ((p.stage=1 and a.action='demo_create') or (a.action='demo_upgrade' and a.details->>'experience_version'=case when p.stage<=2 then '2' else '3' end)))
      ), ranked as (
        select task.id,row_number() over(partition by task.status='done' order by task.id) position
          from public.tasks task where task.workspace_id=p_workspace_id and task.project_id=p.id
      )
      select original.*,ranked.position from original join ranked using(id)
      where original.estimated_minutes is null
        -- Duplicate lookalikes make the identity ambiguous: skip the entire
        -- matching phase rather than selecting an arbitrary user-added row.
        and original.title_count=case when p.stage=1 and d.experience_version>=2 then 2 else 1 end
        and not exists(select 1 from public.audit_log a where a.workspace_id=p_workspace_id and a.entity_type='task' and a.entity_id=original.id and a.action='update')
    loop
      minutes:=least(6000000,case when t.status='done' then done_pool/done_count+case when t.position<=done_pool%done_count then 1 else 0 end
        else pending_pool/pending_count+case when t.position<=pending_pool%pending_count then 1 else 0 end end)::integer;
      update public.tasks set estimated_minutes=greatest(1,minutes),is_milestone=is_milestone or t.production_phase
        where workspace_id=p_workspace_id and id=t.id and estimated_minutes is null;
      get diagnostics affected=row_count;changed:=changed+affected;
    end loop;
  end loop;
  return changed;
end $$;
revoke all on function private.demo_seed_task_planning(uuid) from public,anon,authenticated;

alter function private.demo_upgrade_workspace(uuid) rename to demo_upgrade_workspace_v4;
revoke all on function private.demo_upgrade_workspace_v4(uuid) from public,anon,authenticated;
create function private.demo_upgrade_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); w public.workspaces; d public.workspace_demos; changed integer;
begin
  perform private.lock_user(actor);
  select * into w from public.workspaces where id=p_workspace_id for update;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
  if d.workspace_id is null or d.created_by is distinct from actor or w.created_by is distinct from actor
    or d.archived_at is not null or private.current_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'DEMO_FORBIDDEN' using errcode='42501';
  end if;
  if d.experience_version>=5 then return; end if;
  if d.experience_version<4 then perform private.demo_upgrade_workspace_v4(p_workspace_id); end if;
  changed:=private.demo_seed_task_planning(p_workspace_id);
  update public.workspace_demos set experience_version=5 where workspace_id=p_workspace_id;
  perform private.audit(p_workspace_id,'demo_upgrade','workspace',p_workspace_id,
    jsonb_build_object('experience_version',5,'estimated_tasks',changed,'fictional_operations',true));
end $$;
create or replace function public.demo_upgrade_workspace(p_workspace_id uuid) returns void
language sql volatile security invoker set search_path='' as $$select private.demo_upgrade_workspace(p_workspace_id)$$;
revoke all on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid) from public,anon,authenticated;
grant execute on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid) to authenticated;

-- Existing active demos receive metadata only. Historical v1/v2 retain their
-- version until their normal full upgrade; v4 demos advance to v5 immediately.
do $migration$
declare d record; changed integer;
begin
  for d in select workspace_id,experience_version from public.workspace_demos where archived_at is null order by workspace_id loop
    changed:=private.demo_seed_task_planning(d.workspace_id);
    if d.experience_version=4 then update public.workspace_demos set experience_version=5 where workspace_id=d.workspace_id; end if;
    if changed>0 then perform private.audit(d.workspace_id,'demo_task_planning_backfill','workspace',d.workspace_id,
      jsonb_build_object('experience_version',5,'estimated_tasks',changed,'fictional_operations',true));end if;
  end loop;
end $migration$;
