-- Run after 20261014102151_task_progress_milestones.sql using a privileged SQL
-- connection. Reuses one confirmed account; no auth users, emails or payments
-- are created. Every sample, edit, invoice and audit event below rolls back.
begin;
create temporary table demo_planning_smoke_results (
  new_planned_projects integer, healthy_enterprise_projects integer,
  existing_planned_projects integer, retry_changed_projects integer,
  preserved_business_records boolean, unchanged_auth_users boolean,
  estimated_tasks integer, milestones integer, automatic_updates_verified boolean
) on commit drop;
create temporary table demo_planning_smoke_scenarios (
  code text, used_hours numeric, budget_hours numeric, progress_percent numeric,
  projected_hours numeric, predicted_finish date, deadline date
) on commit drop;
do $$
<<smoke>>
declare
  actor uuid; new_id uuid; legacy_id uuid; real_id uuid; today date; project record; supplied_task uuid;
  planned integer; healthy integer:=0; backfilled integer; retry integer; auth_count bigint;
  before_projects jsonb; after_projects jsonb; before_business jsonb:='{}'; after_business jsonb:='{}';
  data jsonb; table_name text; snapshot jsonb; progress_stamp timestamptz; progress_stamp_after timestamptz;
  projected numeric; automatic_progress numeric; remaining_days integer; predicted date; denied boolean;
  estimated_count integer; milestone_count integer; prior_insight jsonb; updated_insight jsonb; task_json text;
begin
  select id into actor from auth.users where email_confirmed_at is not null order by id limit 1;
  if actor is null then raise exception 'Requires an existing confirmed account; creates no auth accounts.'; end if;
  select count(*) into auth_count from auth.users;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  set local role authenticated;
  select id into new_id from public.demo_create_workspace('Planning rollback smoke','Pacific/Kiritimati','en',gen_random_uuid());
  select count(*) into planned from public.projects p where p.workspace_id=new_id
    and p.due_date is not null and p.progress_percent is not null and p.progress_updated_at is not null;
  if planned<>25 or not exists(select 1 from public.workspace_demos where workspace_id=new_id and experience_version=5) then
    raise exception 'FAIL: new v5 demo planning';
  end if;
  select count(*) filter(where estimated_minutes is not null),count(*) filter(where is_milestone)
    into estimated_count,milestone_count from public.tasks where workspace_id=new_id;
  if estimated_count<>102 or milestone_count<>33 then raise exception 'FAIL: demo task estimates or milestones'; end if;
  today:=(now() at time zone 'Pacific/Kiritimati')::date;
  for project in select p.*,sum(e.minutes) used,
      sum(e.minutes) filter(where e.work_date>=today-27) recent
    from public.projects p join public.time_entries e on e.workspace_id=p.workspace_id and e.project_id=p.id and e.work_date<=today
    where p.workspace_id=new_id group by p.id
  loop
    data:=public.project_insight(new_id,project.id);
    if (data->>'as_of')::date<>today or (data->>'progress_date')::date<>today then raise exception 'FAIL: local planning date'; end if;
    if (data->'tasks'->>'missing_estimates')::int<>0 then raise exception 'FAIL: pristine seed has missing estimates'; end if;
    automatic_progress:=100*(data->'tasks'->>'done_estimated_minutes')::numeric/(data->'tasks'->>'estimated_minutes')::numeric;
    projected:=project.used*100/automatic_progress;
    remaining_days:=ceil((projected-project.used)/(project.recent/28.0));
    predicted:=today+remaining_days;
    if project.code in ('NOVA26','CULT26','LEAP27','BLN26','ACC26','SAP27','POR27','RAIL27','HORIZ26','AERO26','HELIX26','TERRA27') then
      if projected<=project.budget_minutes and predicted<=project.due_date then healthy:=healthy+1; end if;
      if project.code='AERO26' and projected<=project.budget_minutes then raise exception 'FAIL: budget-risk arithmetic'; end if;
      if project.code='CULT26' and predicted<=project.due_date then raise exception 'FAIL: deadline-risk arithmetic'; end if;
      if project.code='LEAP27' and project.due_date>=today then raise exception 'FAIL: overdue scenario'; end if;
    end if;
    reset role;
    insert into demo_planning_smoke_scenarios values(project.code,round(project.used/60.0,1),round(project.budget_minutes/60.0,1),
      automatic_progress,round(projected/60.0,1),case when project.status='active' and automatic_progress<100 then predicted else null end,project.due_date);
    set local role authenticated;
  end loop;
  if healthy<>9 then raise exception 'FAIL: expected 9 healthy enterprise scenarios, got %',healthy; end if;
  select public.project_insight(new_id,id) into prior_insight from public.projects where workspace_id=new_id and code='NOVA26';
  update public.tasks set status='done' where workspace_id=new_id and project_id=(prior_insight->'project'->>'id')::uuid and is_milestone;
  updated_insight:=public.project_insight(new_id,(prior_insight->'project'->>'id')::uuid);
  if (updated_insight->'tasks'->>'done_estimated_minutes')::bigint<=(prior_insight->'tasks'->>'done_estimated_minutes')::bigint
    or (updated_insight->'milestones'->>'done')::int<>1
    or updated_insight->'project' is distinct from prior_insight->'project' then raise exception 'FAIL: live automatic progress or preserved legacy planning';end if;

  -- Construct a v3 sample through the unchanged historical seed, then exercise
  -- the same null-only helper used by the rollout backfill and normal upgrade.
  reset role;
  select id into legacy_id from private.demo_create_workspace_base('Existing planning rollback smoke','America/Los_Angeles','de',gen_random_uuid());
  perform private.demo_upgrade_workspace_v3(legacy_id);
  set local role authenticated;
  update public.projects set due_date=date '2028-08-16' where workspace_id=legacy_id and code='NOVA26';
  update public.projects set progress_percent=37.5 where workspace_id=legacy_id and code='CULT26';
  update public.projects set due_date=date '2028-04-20',progress_percent=0,budget_minutes=123456 where workspace_id=legacy_id and code='AERO26';
  insert into public.projects(workspace_id,code,name,client) values(legacy_id,'NOVA26-deadbeef','Life Science Discovery Network — fictional demo','Sinovac Life Sciences');
  select id into supplied_task from public.tasks where workspace_id=legacy_id order by id limit 1;
  update public.tasks set estimated_minutes=777,is_milestone=false where id=supplied_task;
  select progress_updated_at into progress_stamp from public.projects where workspace_id=legacy_id and code='CULT26';
  select jsonb_agg(to_jsonb(p)-'due_date'-'progress_percent'-'progress_updated_at' order by id) into before_projects from public.projects p where workspace_id=legacy_id;
  foreach table_name in array array['memberships','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_staff_rates','finance_billing_profiles','finance_invoices','finance_payments'] loop
    task_json:=case when table_name='tasks' then 'to_jsonb(t)-''estimated_minutes''-''is_milestone''' else 'to_jsonb(t)' end;
    execute format('select jsonb_agg(%s order by (%s)::text) from public.%I t where workspace_id=$1',task_json,task_json,table_name) into snapshot using legacy_id;
    before_business:=before_business||jsonb_build_object(table_name,snapshot);
  end loop;
  reset role;
  backfilled:=private.demo_seed_project_planning(legacy_id);
  retry:=private.demo_seed_project_planning(legacy_id);
  if backfilled<>24 or retry<>0 then raise exception 'FAIL: null-only backfill / replay counts %, %',backfilled,retry; end if;
  set local role authenticated;
  perform public.demo_upgrade_workspace(legacy_id);
  select jsonb_agg(to_jsonb(p)-'due_date'-'progress_percent'-'progress_updated_at' order by id) into after_projects from public.projects p where workspace_id=legacy_id;
  if before_projects is distinct from after_projects then raise exception 'FAIL: changed project business fields'; end if;
  select progress_updated_at into progress_stamp_after from public.projects where workspace_id=legacy_id and code='CULT26';
  if progress_stamp is distinct from progress_stamp_after
    or not exists(select 1 from public.projects where workspace_id=legacy_id and code='CULT26' and progress_percent=37.5 and due_date is not null)
    or not exists(select 1 from public.projects where workspace_id=legacy_id and code='NOVA26' and due_date=date '2028-08-16' and progress_percent is not null)
    or not exists(select 1 from public.projects where workspace_id=legacy_id and code='AERO26' and progress_percent=0 and due_date=date '2028-04-20' and budget_minutes=123456)
    or not exists(select 1 from public.projects where workspace_id=legacy_id and code='NOVA26-deadbeef' and progress_percent is null and due_date is null) then
    raise exception 'FAIL: changed user planning or filled a user-added lookalike';
  end if;
  if not exists(select 1 from public.tasks where id=supplied_task and estimated_minutes=777 and not is_milestone) then raise exception 'FAIL: user task planning overwritten';end if;
  foreach table_name in array array['memberships','tasks','time_entries','finance_clients','finance_project_plans','finance_expenses','finance_staff_rates','finance_billing_profiles','finance_invoices','finance_payments'] loop
    task_json:=case when table_name='tasks' then 'to_jsonb(t)-''estimated_minutes''-''is_milestone''' else 'to_jsonb(t)' end;
    execute format('select jsonb_agg(%s order by (%s)::text) from public.%I t where workspace_id=$1',task_json,task_json,table_name) into snapshot using legacy_id;
    after_business:=after_business||jsonb_build_object(table_name,snapshot);
  end loop;
  if before_business is distinct from after_business then raise exception 'FAIL: changed existing operational records'; end if;
  denied:=false;
  begin perform private.demo_seed_project_planning(legacy_id); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: internal helper exposed'; end if;
  denied:=false;
  begin perform private.demo_seed_task_planning(legacy_id); exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'FAIL: task helper exposed';end if;
  select id into real_id from public.create_workspace('Real rollback smoke','UTC','EUR');
  insert into public.projects(workspace_id,code,name) values(real_id,'NOVA26','Life Science Discovery Network — fictional demo');
  denied:=false;
  begin perform public.demo_upgrade_workspace(real_id); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: non-demo upgrade allowed'; end if;
  perform public.demo_archive_workspace(new_id);
  reset role;
  if private.demo_seed_project_planning(new_id)<>0 or private.demo_seed_project_planning(real_id)<>0
    or private.demo_seed_task_planning(new_id)<>0 or private.demo_seed_task_planning(real_id)<>0 then raise exception 'FAIL: archived/non-demo backfill'; end if;
  if (select count(*) from auth.users)<>auth_count then raise exception 'FAIL: auth account count changed'; end if;
  insert into demo_planning_smoke_results values(planned,healthy,backfilled,retry,true,true,estimated_count,milestone_count,true);
end $$;
select * from demo_planning_smoke_results;
select * from demo_planning_smoke_scenarios order by code;
rollback;
