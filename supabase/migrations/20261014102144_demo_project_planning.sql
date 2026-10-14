-- Fictional planning examples for the existing demo portfolio. Public reference
-- facts/manifest, budgets, status, task history, finance and recorded time stay intact.
alter table public.workspace_demos drop constraint workspace_demos_experience_version_check;
alter table public.workspace_demos add constraint workspace_demos_experience_version_check check(experience_version in (1,2,3,4));

-- Invoker-only internal helper: migrations and the already authorized demo owner
-- RPC call this. No browser role receives EXECUTE. Do not infer demo provenance
-- from a familiar project code alone: require its manifest identity, seed event,
-- finance plan and seed-time record from the same creation transaction.
create function private.demo_seed_project_planning(p_workspace_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare
  w public.workspaces; d public.workspace_demos; p record;
  today date; first_day date; used numeric; recent numeric; observation integer;
  progress numeric; days_left integer; deadline date; changed integer:=0; affected integer;
begin
  select * into w from public.workspaces where id=p_workspace_id for update;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
  if w.id is null or d.workspace_id is null or d.archived_at is not null then return 0; end if;
  today:=(now() at time zone w.timezone)::date;
  for p in
    with seeds as (
      select value,1 stage from jsonb_array_elements(private.demo_manifest()->'projects')
      union all
      select value,case when n<=5 then 2 else 3 end stage
      from jsonb_array_elements(private.demo_manifest()->'fictional_projects') with ordinality f(value,n)
    )
    select project.*,s.value->>'code' seed_code,s.stage
    from public.projects project join seeds s
      on (project.code=s.value->>'code' or project.code ~ ('^'||(s.value->>'code')||'-[a-f0-9]{8}$'))
      and project.name=s.value->>'name' and project.client=s.value->>'client'
    where project.workspace_id=p_workspace_id
      and (project.due_date is null or project.progress_percent is null)
      and exists(select 1 from public.audit_log created
        where created.workspace_id=p_workspace_id and created.entity_type='project' and created.entity_id=project.id
          and created.action='create' and created.actor_id=d.created_by and created.created_at=project.created_at)
      and exists(select 1 from public.audit_log a
        where a.workspace_id=p_workspace_id and a.entity_type='workspace' and a.entity_id=p_workspace_id
          and a.actor_id=d.created_by and a.created_at=project.created_at
          and ((s.stage=1 and a.action='demo_create') or (s.stage>1 and a.action='demo_upgrade' and a.details->>'experience_version'=s.stage::text)))
      and exists(select 1 from public.finance_project_plans plan
        join public.finance_clients client on client.workspace_id=plan.workspace_id and client.id=plan.client_id
        where plan.workspace_id=p_workspace_id and plan.project_id=project.id
          and plan.created_at=project.created_at and client.created_at=project.created_at)
      and exists(select 1 from public.time_entries e
        where e.workspace_id=p_workspace_id and e.project_id=project.id and e.created_at=project.created_at
          and e.note in ('Fictional demo time; not actual project work','Fiktive Demozeit; keine tatsächliche Projektleistung','虚构演示工时；并非真实项目工作',
            'Fictional demo time — not actual project work','Fiktive Demozeit — keine echte Projektleistung','虚构演示工时 — 并非真实项目工作',
            'Fictional demo time — international client delivery','Fiktive Demozeit — internationale Kundenprojekte','虚构演示工时 — 国际客户项目'))
    for update of project
  loop
    select coalesce(sum(e.minutes),0),coalesce(sum(e.minutes) filter(where e.work_date>=today-27),0),min(e.work_date)
      into used,recent,first_day from public.time_entries e
      where e.workspace_id=p_workspace_id and e.project_id=p.id and e.work_date<=today;
    -- These are explicitly fictional assessments. Most active projects imply
    -- completion at <=85% of the unchanged hours budget. AERO forecasts an
    -- overrun; MOVE retains its existing, deliberately exceeded small budget.
    progress:=coalesce(p.progress_percent,case
      when p.status='archived' then 100
      when p.stage=1 then 95
      when used=0 then 0
      when p.seed_code='MOVE26' then 35
      when p.status='paused' then 40
      when p.seed_code='AERO26' and p.budget_minutes>0 then greatest(1,least(95,floor(used*100/(p.budget_minutes*1.15))))
      when p.budget_minutes>0 then greatest(1,least(95,ceil(used*100/(p.budget_minutes*0.85))))
      else 35 end);
    observation:=least(28,today-first_day+1);
    -- Match project-forecast.ts: all-time effort / progress, then 28 calendar
    -- days of pace. The fallback covers old samples with no recent work.
    days_left:=case when progress>=100 then 0
      when progress>0 and recent>0 and observation>0
        then least(730,ceil((used*(100-progress)/progress)/(recent/observation)))::integer
      else 90 end;
    deadline:=today+case
      when progress=100 then -14
      when p.status='paused' then 120
      when p.seed_code='LEAP27' then -7
      when p.seed_code='CULT26' then greatest(1,days_left-21)
      when p.seed_code='MOVE26' then 14
      else days_left+28 end;
    update public.projects set due_date=coalesce(due_date,greatest(date '2000-01-01',least(date '2100-12-31',deadline))),
      progress_percent=coalesce(progress_percent,progress)
      where workspace_id=p_workspace_id and id=p.id and (due_date is null or progress_percent is null);
    -- The existing progress guard owns progress_updated_at and does not restamp
    -- it when only a missing deadline is filled.
    get diagnostics affected=row_count; changed:=changed+affected;
  end loop;
  return changed;
end $$;
revoke all on function private.demo_seed_project_planning(uuid) from public,anon,authenticated;

alter function private.demo_upgrade_workspace(uuid) rename to demo_upgrade_workspace_v3;
revoke all on function private.demo_upgrade_workspace_v3(uuid) from public,anon,authenticated;
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
  if d.experience_version>=4 then return; end if;
  if d.experience_version<3 then perform private.demo_upgrade_workspace_v3(p_workspace_id); end if;
  changed:=private.demo_seed_project_planning(p_workspace_id);
  update public.workspace_demos set experience_version=4 where workspace_id=p_workspace_id;
  perform private.audit(p_workspace_id,'demo_upgrade','workspace',p_workspace_id,
    jsonb_build_object('experience_version',4,'planning_projects',changed,'fictional_operations',true));
end $$;
-- Rebind the SQL wrapper after the rename; new creation already calls the
-- current private upgrade function, while a create request retry stays a no-op.
create or replace function public.demo_upgrade_workspace(p_workspace_id uuid) returns void
language sql volatile security invoker set search_path='' as $$
  select private.demo_upgrade_workspace(p_workspace_id)
$$;
revoke all on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid) from public,anon,authenticated;
grant execute on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid) to authenticated;

-- Authorized one-time rollout: existing active demo workspaces immediately get
-- missing planning only. Legacy v1/v2 still need their ordinary full upgrade;
-- archived demos and unmarked workspaces are never selected.
do $migration$
declare d record; changed integer;
begin
  for d in select workspace_id,experience_version from public.workspace_demos where archived_at is null order by workspace_id loop
    changed:=private.demo_seed_project_planning(d.workspace_id);
    if d.experience_version=3 then
      update public.workspace_demos set experience_version=4 where workspace_id=d.workspace_id;
    end if;
    if changed>0 then
      perform private.audit(d.workspace_id,'demo_planning_backfill','workspace',d.workspace_id,
        jsonb_build_object('experience_version',4,'planning_projects',changed,'fictional_operations',true));
    end if;
  end loop;
end $migration$;
