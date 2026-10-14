-- Run after the additive project_planning_insights migration, as a database
-- administrator. All fixtures are synthetic and the final ROLLBACK removes them.
-- No existing workspace, project, user or business value is changed.
begin;
set local timezone='Pacific/Honolulu';
create temporary table project_insight_smoke_results(total_minutes bigint,recent_minutes bigint,denials integer,planning_preserved boolean) on commit drop;
do $$
<<smoke>>
declare
  owner_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid();
  member_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  workspace_id uuid; project_id uuid; foreign_workspace_id uuid; foreign_project_id uuid;
  approved_id uuid; today date:=(now() at time zone 'Pacific/Kiritimati')::date;
  value jsonb; before_planning jsonb; denied boolean; denials integer:=0;
  person uuid; requested_project uuid; n integer;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,owner_id::text||'@example.invalid',now(),'{}'),
    (manager_id,manager_id::text||'@example.invalid',now(),'{}'),
    (member_id,member_id::text||'@example.invalid',now(),'{}'),
    (outsider_id,outsider_id::text||'@example.invalid',now(),'{}');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into workspace_id from public.create_workspace('Project insight rollback smoke','Pacific/Kiritimati','EUR');
  insert into public.projects(workspace_id,code,name,due_date,progress_percent)
    values(smoke.workspace_id,'QA','Synthetic project',today+30,40) returning id into project_id;
  perform public.invite_member(workspace_id,manager_id::text||'@example.invalid','manager');
  perform public.invite_member(workspace_id,member_id::text||'@example.invalid','member');

  reset role;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into foreign_workspace_id from public.create_workspace('Foreign insight rollback smoke','UTC','USD');
  insert into public.projects(workspace_id,code,name) values(smoke.foreign_workspace_id,'FOREIGN','Foreign project') returning id into foreign_project_id;

  reset role;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.accept_invitations();
  insert into public.time_entries(workspace_id,project_id,work_date,minutes)
    values(smoke.workspace_id,smoke.project_id,today-1,10) returning id into approved_id;
  insert into public.time_entries(workspace_id,project_id,work_date,minutes)
    values(smoke.workspace_id,smoke.project_id,today-1,20);
  perform public.submit_entries(workspace_id,today-1,today-1);
  perform public.start_timer(workspace_id,project_id,'Synthetic running timer',true);

  reset role;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.accept_invitations();
  perform public.review_entry(approved_id,true);
  insert into public.time_entries(workspace_id,project_id,work_date,minutes)
    select smoke.workspace_id,smoke.project_id,today,1 from generate_series(1,1005);
  insert into public.time_entries(workspace_id,project_id,work_date,minutes) values
    (smoke.workspace_id,smoke.project_id,today-400,120),
    (smoke.workspace_id,smoke.project_id,today-27,10),
    (smoke.workspace_id,smoke.project_id,today-28,20),
    (smoke.workspace_id,smoke.project_id,today+1,999);
  insert into public.tasks(workspace_id,project_id,title,status,due_date) values
    (smoke.workspace_id,smoke.project_id,'Late','todo',today-1),
    (smoke.workspace_id,smoke.project_id,'Today','doing',today),
    (smoke.workspace_id,smoke.project_id,'Done','done',today-1);
  value:=public.project_insight(workspace_id,project_id);
  if (value->>'total_minutes')::bigint<>1185 or value->>'as_of'<>today::text
    or value->>'progress_date'<>today::text or today=current_date
    or value->>'first_work_date'<>(today-400)::text or value->>'last_work_date'<>today::text
    or value->'recent_daily'<>jsonb_build_array(
      jsonb_build_object('work_date',today-27,'minutes',10),
      jsonb_build_object('work_date',today-1,'minutes',30),
      jsonb_build_object('work_date',today,'minutes',1005))
    or value->'tasks'<>jsonb_build_object('total',3,'done',1,'overdue',1) then
    raise exception 'FAIL: team totals, history, future exclusion, task counts or workspace timezone';
  end if;
  before_planning:=value->'project';
  insert into public.projects(id,workspace_id,code,name)
    values(smoke.project_id,smoke.workspace_id,'QA','Legacy edit') on conflict(id) do update set name=excluded.name;
  value:=public.project_insight(workspace_id,project_id);
  if ((value->'project')-'name') is distinct from (before_planning-'name') then raise exception 'FAIL: old-client edit changed planning'; end if;
  denied:=false;
  begin update public.projects p set progress_updated_at='2000-01-01',progress_percent=50 where p.id=smoke.project_id;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: server timestamp accepted a client override'; end if;
  denials:=denials+1;
  foreach requested_project in array array[foreign_project_id,gen_random_uuid(),null::uuid] loop
    denied:=false;
    begin perform public.project_insight(workspace_id,requested_project);
    exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: foreign, missing or null project was accepted'; end if;
    denials:=denials+1;
  end loop;
  foreach person in array array[member_id,outsider_id] loop
    reset role;
    perform set_config('request.jwt.claim.sub',person::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);
    set local role authenticated;
    denied:=false;
    begin perform public.project_insight(workspace_id,project_id);
    exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: member or foreign owner received team aggregate'; end if;
    denials:=denials+1;
  end loop;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.set_member_role(workspace_id,manager_id,'member');
  reset role;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated')::text,true);
  set local role authenticated;
  denied:=false;
  begin perform public.project_insight(workspace_id,project_id);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: role downgrade retained aggregate access'; end if;
  denials:=denials+1;
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  denied:=false;
  begin perform public.project_insight(workspace_id,project_id);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous aggregate access'; end if;
  denials:=denials+1;
  reset role;
  if exists(select 1 from pg_proc where oid='public.project_insight(uuid,uuid)'::regprocedure and (prosecdef or provolatile<>'s' or not proconfig @> array['search_path=""'])) then
    raise exception 'FAIL: RPC is not stable and security invoker with an empty search path';
  end if;
  insert into pg_temp.project_insight_smoke_results values(1185,1045,denials,true);
end $$;
select 'passed; the following ROLLBACK removes all synthetic data' as result,* from pg_temp.project_insight_smoke_results;
rollback;
