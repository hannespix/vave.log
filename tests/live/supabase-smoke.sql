-- Run with a privileged database connection after migrations.
-- All synthetic accounts and data are rolled back; this sends no email and
-- does not replace an actual Auth/OAuth browser login or concurrency test.
begin;
do $$
<<smoke>>
declare
  owner_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  workspace_id uuid; other_workspace_id uuid; project_id uuid; entry_id uuid; timer_id uuid;
  stopped jsonb; retried jsonb; reviewed public.time_entries; n integer; denied boolean;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,owner_id::text||'@example.invalid',now(),'{}'),
    (member_id,member_id::text||'@example.invalid',now(),'{}'),
    (outsider_id,outsider_id::text||'@example.invalid',now(),'{}');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into workspace_id from public.create_workspace('VAVE smoke A','Europe/Berlin','EUR');
  insert into public.projects(workspace_id,code,name) values(smoke.workspace_id,'QA','Smoke project') returning id into project_id;
  perform public.invite_member(workspace_id,member_id::text||'@example.invalid','member');

  reset role;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.workspaces w where w.id=smoke.workspace_id) then raise exception 'FAIL: foreign workspace visible'; end if;
  if exists(select 1 from public.projects p where p.id=smoke.project_id) then raise exception 'FAIL: foreign project visible'; end if;
  select id into other_workspace_id from public.create_workspace('VAVE smoke B','UTC','USD');

  reset role;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  set local role authenticated;
  select public.accept_invitations() into n;
  if n<>1 then raise exception 'FAIL: invitation not accepted'; end if;
  if exists(select 1 from public.workspaces w where w.id=smoke.other_workspace_id) then raise exception 'FAIL: member sees other tenant'; end if;
  insert into public.time_entries(workspace_id,project_id,work_date,minutes,note,billable)
    values(smoke.workspace_id,smoke.project_id,current_date,75,'Rollback-only verification',true) returning id into entry_id;
  select public.submit_entries(workspace_id,current_date,current_date) into n;
  if n<>1 then raise exception 'FAIL: submission'; end if;
  denied:=false;
  begin perform public.review_entry(entry_id,true); exception when others then denied:=true; end;
  if not denied then raise exception 'FAIL: member approved own entry'; end if;

  select id into timer_id from public.start_timer(workspace_id,project_id,'Rollback-only timer',true);
  reset role;
  update public.running_timers t set started_at=clock_timestamp()-interval '125 seconds' where t.id=smoke.timer_id;
  set local role authenticated;
  select jsonb_agg(to_jsonb(e) order by e.id) into stopped from public.stop_timer(timer_id) e;
  select jsonb_agg(to_jsonb(e) order by e.id) into retried from public.stop_timer(timer_id) e;
  if stopped is null or stopped is distinct from retried then raise exception 'FAIL: timer replay'; end if;
  if (select sum(e.minutes) from public.time_entries e where e.timer_id=smoke.timer_id)<>2 then raise exception 'FAIL: timer minutes'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select * into reviewed from public.review_entry(entry_id,true);
  if reviewed.status<>'approved' then raise exception 'FAIL: owner approval'; end if;
  perform public.set_member_role(workspace_id,member_id,'disabled');

  reset role;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.workspaces w where w.id=smoke.workspace_id) then raise exception 'FAIL: disabled member still has access'; end if;
  reset role;
end $$;
rollback;
select 'passed: isolation, invitation, time entry, submission, approval, timer replay, offboarding; test data rolled back' as result;
