-- Run with a privileged Supabase SQL connection AFTER all agency migrations.
-- Synthetic, random accounts only; no Auth email API, customer mail, or payments.
-- Every write (including invitations, invoices and demo samples) is rolled back.
-- This checks actual API database roles, not browser login or concurrent sessions.
begin;
create temporary table agency_smoke_results (
  role_denials integer, issued_documents integer, cancellation_documents integer,
  invoice_audit_actions integer, archived_demos integer, retained_demo_entries integer, demo_people integer, demo_documents integer, unchanged_auth_users boolean
) on commit drop;
do $$
<<smoke>>
declare
  owner_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid();
  member_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  workspace_id uuid; foreign_workspace_id uuid; project_id uuid; foreign_project_id uuid;
  client_id uuid; invoice_id uuid; cancellation_id uuid; demo_id uuid; demo_retry_id uuid;
  demo_invoice_id uuid; demo_person uuid; request_id uuid:=gen_random_uuid(); before_auth bigint; before_entries bigint;
  draft jsonb; issued jsonb; replay jsonb; cancelled jsonb; paid jsonb; preserved jsonb;
  denied boolean; denial_count integer:=0; n integer; t text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,owner_id::text||'@example.invalid',now(),'{}'),
    (manager_id,manager_id::text||'@example.invalid',now(),'{}'),
    (member_id,member_id::text||'@example.invalid',now(),'{}'),
    (outsider_id,outsider_id::text||'@example.invalid',now(),'{}');
  select count(*) into before_auth from auth.users;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into workspace_id from public.create_workspace('Agency rollback smoke','UTC','EUR');
  insert into public.projects(workspace_id,code,name)
    values(smoke.workspace_id,'QA','Synthetic project') returning id into project_id;
  insert into public.finance_clients(workspace_id,name,billing_address)
    values(smoke.workspace_id,'Synthetic customer','Test customer address') returning id into client_id;
  insert into public.finance_billing_profiles(workspace_id,legal_name,billing_address,tax_id,invoice_prefix)
    values(smoke.workspace_id,'Synthetic issuer','Test issuer address','TEST-ONLY','SMOKE');
  perform public.invite_member(workspace_id,manager_id::text||'@example.invalid','manager');
  perform public.invite_member(workspace_id,member_id::text||'@example.invalid','member');

  reset role;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into foreign_workspace_id from public.create_workspace('Foreign rollback smoke','UTC','USD');
  insert into public.projects(workspace_id,code,name)
    values(smoke.foreign_workspace_id,'OTHER','Foreign synthetic project') returning id into foreign_project_id;
  if exists(select 1 from public.finance_clients c where c.workspace_id=smoke.workspace_id) then
    raise exception 'FAIL: foreign owner reads customer data';
  end if;
  denied:=false;
  begin perform public.finance_list_invoices(workspace_id);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: foreign owner invokes finance RPC'; end if;
  denial_count:=denial_count+1;

  reset role;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated')::text,true);
  set local role authenticated;
  select public.accept_invitations() into n;
  if n<>1 then raise exception 'FAIL: manager membership setup'; end if;
  if not exists(select 1 from public.finance_billing_profiles b where b.workspace_id=smoke.workspace_id and b.legal_name='Synthetic issuer') then
    raise exception 'FAIL: manager cannot read billing identity';
  end if;
  update public.finance_billing_profiles b set legal_name='Unauthorized change' where b.workspace_id=smoke.workspace_id;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: manager changed owner-only billing identity'; end if;
  denial_count:=denial_count+1;
  denied:=false;
  begin
    insert into public.finance_expenses(workspace_id,project_id,expense_date,description,amount_minor,not_time_costed)
      values(smoke.workspace_id,smoke.foreign_project_id,current_date,'Cross-tenant attempt',1,true);
  exception when foreign_key_violation then denied:=true; end;
  if not denied then raise exception 'FAIL: finance expense accepted a foreign project'; end if;
  denial_count:=denial_count+1;

  draft:=public.finance_save_draft(jsonb_build_object(
    'workspace_id',workspace_id,'client_id',client_id,'project_id',project_id,'language','en',
    'issue_date',current_date,'due_date',current_date+14,'service_from',current_date,'service_to',current_date,
    'notes','Rollback-only verification','payment_instructions','Test only; do not pay',
    'lines',jsonb_build_array(jsonb_build_object('description','Synthetic manual installment','quantity',1,
      'unit_price_minor',10000,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
  invoice_id:=(draft->>'id')::uuid;
  if draft->>'status'<>'draft' or draft->>'number' is not null then raise exception 'FAIL: draft was numbered or issued'; end if;
  issued:=public.finance_issue_invoice(workspace_id,invoice_id);
  replay:=public.finance_issue_invoice(workspace_id,invoice_id);
  if issued is distinct from replay or issued->>'number' is null or issued->>'status'<>'issued'
    or (issued->>'net_minor')::bigint<>10000 or (issued->>'tax_minor')::bigint<>1900 or (issued->>'total_minor')::bigint<>11900 then
    raise exception 'FAIL: issue totals, number or retry changed';
  end if;
  denied:=false;
  begin update public.finance_invoices i set lines='[]',total_minor=1 where i.id=smoke.invoice_id;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: direct update changed issued document'; end if;
  denial_count:=denial_count+1;
  denied:=false;
  begin delete from public.finance_invoices i where i.id=smoke.invoice_id;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: issued document was deleted'; end if;
  denial_count:=denial_count+1;
  update public.finance_clients c set name='Changed customer',billing_address='Changed address' where c.id=smoke.client_id;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  update public.finance_billing_profiles b set legal_name='Changed issuer',tax_id='CHANGED-TEST' where b.workspace_id=smoke.workspace_id;
  preserved:=public.finance_get_invoice(workspace_id,invoice_id);
  if preserved->'issuer_snapshot' is distinct from issued->'issuer_snapshot'
    or preserved->'customer_snapshot' is distinct from issued->'customer_snapshot'
    or preserved->'lines' is distinct from issued->'lines' or preserved->>'currency'<>'EUR' then
    raise exception 'FAIL: live billing edits changed issued snapshots';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated')::text,true);
  set local role authenticated;
  paid:=public.finance_set_paid(workspace_id,invoice_id,true);
  if not (paid->>'paid')::boolean or (paid-'paid') is distinct from (preserved-'paid') then
    raise exception 'FAIL: payment action changed financial document';
  end if;
  cancelled:=public.finance_cancel_invoice(workspace_id,invoice_id,'Synthetic full correction');
  replay:=public.finance_cancel_invoice(workspace_id,invoice_id,'Retry of synthetic correction');
  cancellation_id:=(cancelled->>'id')::uuid;
  if cancelled is distinct from replay or cancelled->>'status'<>'cancellation'
    or cancelled->>'cancellation_of'<>invoice_id::text or cancelled->>'number'=issued->>'number'
    or (cancelled->>'total_minor')::bigint<>-11900 or (cancelled->'lines'->0->>'net_minor')::bigint<>-10000
    or cancelled->'issuer_snapshot' is distinct from issued->'issuer_snapshot' then
    raise exception 'FAIL: full cancellation snapshot, sign, number or retry';
  end if;
  if public.finance_get_invoice(workspace_id,invoice_id)->>'cancellation_id'<>cancellation_id::text then
    raise exception 'FAIL: cancellation not linked from original';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  set local role authenticated;
  select public.accept_invitations() into n;
  if n<>1 then raise exception 'FAIL: member membership setup'; end if;
  foreach t in array array['finance_clients','finance_billing_profiles','finance_staff_rates','finance_project_plans',
    'finance_expenses','finance_invoices','finance_payments','finance_time_claims'] loop
    execute format('select count(*) from public.%I where workspace_id=$1',t) into n using workspace_id;
    if n<>0 then raise exception 'FAIL: member reads protected financial table'; end if;
  end loop;
  denied:=false;
  begin perform public.finance_issue_invoice(workspace_id,invoice_id);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: member invokes issue RPC'; end if;
  denial_count:=denial_count+1;
  denied:=false;
  begin perform public.finance_set_paid(workspace_id,invoice_id,false);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: member changes payment state'; end if;
  denial_count:=denial_count+1;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select id into demo_id from public.demo_create_workspace('Rollback-only agency demo','UTC','en',request_id);
  select id into demo_retry_id from public.demo_create_workspace('Rollback-only agency demo','UTC','en',request_id);
  if demo_id is distinct from demo_retry_id then raise exception 'FAIL: demo retry duplicated workspace'; end if;
  if not exists(select 1 from public.workspace_demos d where d.workspace_id=smoke.demo_id and d.created_by=smoke.owner_id and d.archived_at is null and d.experience_version=5 and jsonb_typeof(d.manifest)='object') then
    raise exception 'FAIL: owner cannot get demo metadata';
  end if;
  select i.id into demo_invoice_id from public.finance_invoices i where i.workspace_id=smoke.demo_id and i.status='draft' order by i.created_at limit 1;
  if demo_invoice_id is null then raise exception 'FAIL: demo invoice draft missing'; end if;
  select count(*) into before_entries from public.time_entries e where e.workspace_id=smoke.demo_id;
  if before_entries<>3713 then raise exception 'FAIL: full demo history missing'; end if;
  if (select sum(e.minutes)/60.0 from public.time_entries e where e.workspace_id=smoke.demo_id) not between 24000 and 28000
    or exists(select 1 from public.time_entries e where e.workspace_id=smoke.demo_id group by e.user_id,e.work_date having sum(e.minutes)>480)
    or exists(select 1 from public.time_entries e where e.workspace_id=smoke.demo_id and e.work_date>current_date) then
    raise exception 'FAIL: enterprise time history is not a realistic six-week workload';
  end if;
  if (select count(*) from public.memberships m join public.finance_staff_rates r using(workspace_id,user_id) where m.workspace_id=smoke.demo_id and m.is_demo and r.kind='employee')<>100
    or (select count(*) from public.memberships m join public.finance_staff_rates r using(workspace_id,user_id) where m.workspace_id=smoke.demo_id and m.is_demo and r.kind='freelancer')<>12 then
    raise exception 'FAIL: enterprise employee/freelancer mix';
  end if;
  if (select sum(p.fixed_fee_minor) from public.finance_project_plans p where p.workspace_id=smoke.demo_id and p.fixed_fee_minor>=100000000)<>2255000000
    or (select sum((l->>'planned_minutes')::bigint)/60 from public.finance_project_plans p cross join lateral jsonb_array_elements(p.lines) l where p.workspace_id=smoke.demo_id and p.fixed_fee_minor>=100000000)<>130000 then
    raise exception 'FAIL: enterprise annual portfolio economics';
  end if;
  if exists(select 1 from public.finance_project_plans p where p.workspace_id=smoke.demo_id and p.fixed_fee_minor>=100000000
    and (p.fixed_fee_minor-p.planned_expenses_minor-(select sum((l->>'planned_minutes')::numeric/60*(l->>'cost_rate_minor')::numeric) from jsonb_array_elements(p.lines) l))/p.fixed_fee_minor not between 0.20 and 0.35) then
    raise exception 'FAIL: enterprise contribution margins';
  end if;
  if (select coalesce(sum(i.net_minor),0) from public.finance_invoices i join public.finance_payments p on p.invoice_id=i.id
    where i.workspace_id=smoke.demo_id and i.status='issued' and p.paid and i.issue_date>=date_trunc('month',current_date)::date)<100000000
    or (select coalesce(sum(i.net_minor),0) from public.finance_invoices i left join public.finance_payments p on p.invoice_id=i.id
    where i.workspace_id=smoke.demo_id and i.status='issued' and not coalesce(p.paid,false) and i.issue_date>=date_trunc('month',current_date)::date
    and not exists(select 1 from public.finance_invoices c where c.cancellation_of=i.id))<100000000 then
    raise exception 'FAIL: enterprise current-month paid and open invoice balances';
  end if;
  perform public.demo_upgrade_workspace(demo_id);
  if (select count(*) from public.time_entries e where e.workspace_id=smoke.demo_id)<>before_entries then raise exception 'FAIL: completed upgrade duplicated history'; end if;
  if (select count(*) from public.memberships m where m.workspace_id=smoke.demo_id and m.is_demo)<>112
    or exists(select 1 from public.memberships m where m.workspace_id=smoke.demo_id and m.is_demo and (m.auth_user_id is not null or m.role='owner' or m.email not like '%@example.invalid'))
    or exists(select 1 from public.running_timers r where r.workspace_id=smoke.demo_id)
    or exists(select 1 from public.invitations i where i.workspace_id=smoke.demo_id) then raise exception 'FAIL: demo personas are not isolated non-login identities'; end if;
  if exists(select 1 from public.finance_invoices i where i.workspace_id=smoke.demo_id and (not i.is_demo or (i.number is not null and i.number not like 'DEMO-%'))) then raise exception 'FAIL: unmarked demo document'; end if;
  update public.finance_billing_profiles b set invoice_prefix='REAL',payment_details='Do not use this account' where b.workspace_id=smoke.demo_id;
  issued:=public.finance_issue_invoice(demo_id,demo_invoice_id);
  if issued->>'number' not like 'DEMO-%' or issued->>'is_demo'<>'true'
    or issued->>'payment_instructions' not like '%DO NOT PAY%'
    or issued->'issuer_snapshot'->>'payment_details' not like '%DO NOT PAY%'
    or issued->'customer_snapshot'->>'is_demo'<>'true' then raise exception 'FAIL: demo issuance lost persistent markings'; end if;
  replay:=public.finance_issue_invoice(demo_id,demo_invoice_id);
  if replay is distinct from issued then raise exception 'FAIL: demo issue replay changed document'; end if;
  cancelled:=public.finance_cancel_invoice(demo_id,demo_invoice_id,'Fictional smoke correction');
  if cancelled->>'is_demo'<>'true' or cancelled->>'number' not like 'DEMO-%'
    or (cancelled->>'total_minor')::bigint<>-(issued->>'total_minor')::bigint then raise exception 'FAIL: demo cancellation markings or amount'; end if;
  select m.user_id into demo_person from public.memberships m where m.workspace_id=smoke.demo_id and m.is_demo limit 1;
  denied:=false;
  begin perform public.set_member_role(demo_id,demo_person,'owner');
  exception when raise_exception then if sqlerrm like 'DEMO_%' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'FAIL: demo person promoted to owner'; end if;
  denial_count:=denial_count+1;
  reset role;
  if (select count(*) from auth.users)<>before_auth then raise exception 'FAIL: demo created login users'; end if;
  if exists(select 1 from private.demo_seed_context) then raise exception 'FAIL: demo seed capability retained'; end if;
  perform set_config('request.jwt.claim.sub',demo_person::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',demo_person,'role','authenticated')::text,true);
  set local role authenticated;
  if private.current_role(demo_id) is not null or exists(select 1 from public.workspaces w where w.id=smoke.demo_id) then raise exception 'FAIL: demo identity can authenticate'; end if;
  denial_count:=denial_count+1;

  reset role;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.workspace_demos d where d.workspace_id=smoke.demo_id) then raise exception 'FAIL: foreign owner reads demo metadata'; end if;
  denied:=false;
  begin perform public.demo_archive_workspace(demo_id);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: foreign owner archived demo'; end if;
  denial_count:=denial_count+1;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.demo_archive_workspace(demo_id);
  perform public.demo_archive_workspace(demo_id);
  if exists(select 1 from public.workspaces w where w.id=smoke.demo_id)
    or exists(select 1 from public.workspace_demos d where d.workspace_id=smoke.demo_id)
    or exists(select 1 from public.finance_invoices i where i.workspace_id=smoke.demo_id) then
    raise exception 'FAIL: archived demo remains visible';
  end if;
  if not exists(select 1 from public.workspaces w where w.id=smoke.workspace_id) then raise exception 'FAIL: archive affected real workspace'; end if;

  reset role;
  if not exists(select 1 from public.workspace_demos d where d.workspace_id=smoke.demo_id and d.archived_at is not null)
    or not exists(select 1 from public.time_entries e where e.workspace_id=smoke.demo_id)
    or not exists(select 1 from public.finance_invoices i where i.id=smoke.demo_invoice_id and i.status='issued' and i.is_demo) then
    raise exception 'FAIL: archive destroyed retained demo records';
  end if;
  select count(*) into n from public.audit_log a where a.workspace_id=smoke.workspace_id and a.action in ('finance_issue','finance_cancel','finance_paid');
  if n<>3 then raise exception 'FAIL: invoice transition audit or retry count'; end if;
  insert into pg_temp.agency_smoke_results
    select denial_count,
      (select count(*) from public.finance_invoices i where i.workspace_id=smoke.workspace_id and i.status='issued'),
      (select count(*) from public.finance_invoices i where i.workspace_id=smoke.workspace_id and i.status='cancellation'),n,
      (select count(*) from public.workspace_demos d where d.workspace_id=smoke.demo_id and d.archived_at is not null),
      (select count(*) from public.time_entries e where e.workspace_id=smoke.demo_id),
      (select count(*) from public.memberships m where m.workspace_id=smoke.demo_id and m.is_demo),
      (select count(*) from public.finance_invoices i where i.workspace_id=smoke.demo_id and i.is_demo),
      (select count(*) from auth.users)=before_auth;
end $$;
-- Non-sensitive counts only; no account IDs, invoice contents or customer data.
select 'passed; the following ROLLBACK removes all smoke data' as result, * from pg_temp.agency_smoke_results;
rollback;
