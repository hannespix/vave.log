-- Privileged SQL connection; exact rollback-only fixture. Run AFTER the workspace
-- administration migration. Deletes only IDs generated below in this transaction.
-- Synthetic auth rows never receive email or sign in. No existing workspace is deleted.
begin;
create temporary table workspace_admin_smoke_results (
 deleted_fixture_workspaces integer, denied_roles integer, archived_transfer_verified boolean,
 real_documents_deleted boolean, running_timer_preserved boolean, other_workspace_unchanged boolean,
 auth_users_unchanged boolean, private_capability_protected boolean
) on commit drop;
do $$
<<smoke>>
declare
 owner_id uuid:=gen_random_uuid(); successor_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
 demo_id uuid; real_id uuid; keep_id uuid; project_id uuid; client_id uuid; timer_id uuid; invoice_id uuid;
 summary jsonb; draft jsonb; before_keep jsonb; auth_before bigint; existing_before bigint;
 denied boolean; denial_count integer:=0; t record; leftover bigint; tested_role text;
begin
 select count(*) into existing_before from public.workspaces;
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values
  (owner_id,owner_id::text||'@example.invalid',now(),'{}'),
  (successor_id,successor_id::text||'@example.invalid',now(),'{}'),
  (outsider_id,outsider_id::text||'@example.invalid',now(),'{}');
 select count(*) into auth_before from auth.users;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 set local role authenticated;
 select id into demo_id from public.demo_create_workspace('Delete Ä 工作室 rollback fixture','UTC','en',gen_random_uuid());
 select id into real_id from public.create_workspace('Delete real rollback fixture','UTC','EUR');
 select id into keep_id from public.create_workspace('Keep rollback fixture','UTC','EUR');
 insert into public.projects(workspace_id,code,name)values(keep_id,'KEEP','Keep project');
 select jsonb_agg(to_jsonb(p) order by p.id) into before_keep from public.projects p where p.workspace_id=keep_id;
 select value into summary from jsonb_array_elements(public.list_owned_workspaces()) where value->>'id'=demo_id::text;
 if (summary->'counts'->>'projects')::integer<>25 or (summary->'counts'->>'tasks')::integer<>102
  or (summary->'counts'->>'invoices')::integer<1 then raise exception 'FAIL: full deletion preview';end if;
 -- Exact name and true confirmation are required, even for an owner.
 denied:=false;begin perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture ',true);
 exception when raise_exception then if sqlerrm='WORKSPACE_ADMIN_CONFIRMATION' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'FAIL: altered confirmation accepted';end if;
 denied:=false;begin perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture',false);
 exception when raise_exception then if sqlerrm='WORKSPACE_ADMIN_CONFIRMATION' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'FAIL: false confirmation accepted';end if;
 -- Running timer must survive a rejected deletion of a REAL workspace.
 insert into public.projects(workspace_id,code,name)values(real_id,'REAL','Real fixture project')returning id into project_id;
 select id into timer_id from public.start_timer(real_id,project_id,'Do not discard time',true);
 denied:=false;begin perform public.delete_workspace(real_id,'Delete real rollback fixture',true);
 exception when raise_exception then if sqlerrm='WORKSPACE_ADMIN_RUNNING_TIMERS' then denied:=true;else raise;end if;end;
 if not denied or not exists(select 1 from public.running_timers r where r.id=timer_id)then raise exception 'FAIL: running timer was not preserved';end if;
 perform public.discard_timer(timer_id);
 insert into public.finance_clients(workspace_id,name,billing_address)values(real_id,'Fixture customer','Fixture address')returning id into client_id;
 insert into public.finance_billing_profiles(workspace_id,legal_name,billing_address,tax_id)values(real_id,'Fixture issuer','Fixture address','TEST');
 draft:=public.finance_save_draft(jsonb_build_object('workspace_id',real_id,'project_id',project_id,'client_id',client_id,
  'language','en','issue_date',current_date,'due_date',current_date,'service_from',current_date,'service_to',current_date,
  'notes','Rollback fixture only','payment_instructions','Do not pay','lines',jsonb_build_array(jsonb_build_object(
   'description','Fixture work','quantity',1,'unit_price_minor',1000,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
 invoice_id:=(draft->>'id')::uuid;
 perform public.finance_issue_invoice(real_id,invoice_id);
 perform public.finance_cancel_invoice(real_id,invoice_id,'Fixture correction');
 perform public.invite_member(demo_id,successor_id::text||'@example.invalid','manager');
 reset role;
 perform set_config('request.jwt.claim.sub',successor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',successor_id,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.accept_invitations();
 -- Manager/member/disabled are denied and receive no owner summaries.
 foreach tested_role in array array['manager','member','disabled']loop
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  perform public.set_member_role(demo_id,successor_id,tested_role);
  reset role;perform set_config('request.jwt.claim.sub',successor_id::text,true);set local role authenticated;
  if public.list_owned_workspaces()<>'[]'::jsonb then raise exception 'FAIL: nonowner preview';end if;
  denied:=false;begin perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture',true);
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'FAIL: role % deleted workspace',tested_role;end if;
  denial_count:=denial_count+1;
 end loop;
 reset role;perform set_config('request.jwt.claim.sub',outsider_id::text,true);set local role authenticated;
 denied:=false;begin perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture',true);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: outsider deletion';end if;denial_count:=denial_count+1;
 reset role;perform set_config('request.jwt.claim.sub','',true);set local role anon;
 denied:=false;begin perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture',true);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: anonymous deletion';end if;denial_count:=denial_count+1;
 reset role;perform set_config('request.jwt.claim.sub',owner_id::text,true);set local role authenticated;
 -- Request-controlled flags cannot create the capability.
 perform set_config('vave.delete_workspace',demo_id::text,true);
 denied:=false;begin insert into private.workspace_delete_context values(demo_id,owner_id,txid_current());
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: capability forgery';end if;
 denied:=false;begin perform private.workspace_delete_allowed(demo_id);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: helper execution grant';end if;
 -- Strong row guards remain effective even for ordinary privileged maintenance.
 reset role;
 denied:=false;begin delete from public.finance_invoices i where i.workspace_id=real_id;
 exception when raise_exception then if sqlerrm='FINANCE_CONFLICT' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'FAIL: ordinary invoice guard bypass';end if;
 denied:=false;begin delete from public.memberships m where m.workspace_id=real_id;
 exception when raise_exception then if sqlerrm like '%letzte Owner%' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'FAIL: ordinary last owner guard bypass';end if;
 set local role authenticated;
 perform public.set_member_role(demo_id,successor_id,'owner');
 perform public.demo_archive_workspace(demo_id);
 -- A newly promoted owner can delete this archive, without being its creator.
 reset role;perform set_config('request.jwt.claim.sub',successor_id::text,true);set local role authenticated;
 select value into summary from jsonb_array_elements(public.list_owned_workspaces())where value->>'id'=demo_id::text;
 if summary is null or summary->>'archived_at' is null then raise exception 'FAIL: archived owner preview';end if;
 perform public.delete_workspace(demo_id,'Delete Ä 工作室 rollback fixture',true);
 reset role;perform set_config('request.jwt.claim.sub',owner_id::text,true);set local role authenticated;
 perform public.delete_workspace(real_id,'Delete real rollback fixture',true);
 reset role;
 if exists(select 1 from public.workspaces where id in(demo_id,real_id))then raise exception 'FAIL: deleted workspace remains';end if;
 -- Check every workspace-scoped relation, including private receipts/counters/context.
 for t in select table_schema,table_name from information_schema.columns where column_name='workspace_id'and table_schema in('public','private')loop
  execute format('select count(*) from %I.%I where workspace_id=any($1)',t.table_schema,t.table_name)into leftover using array[demo_id,real_id];
  if leftover<>0 then raise exception 'FAIL: leftover rows in %.%',t.table_schema,t.table_name;end if;
 end loop;
 if auth_before<>(select count(*)from auth.users)then raise exception 'FAIL: auth users changed';end if;
 if existing_before+1<>(select count(*)from public.workspaces)then raise exception 'FAIL: unexpected workspace deletion';end if;
 if before_keep is distinct from(select jsonb_agg(to_jsonb(p) order by p.id)from public.projects p where p.workspace_id=keep_id)then raise exception 'FAIL: other workspace changed';end if;
 insert into workspace_admin_smoke_results values(2,denial_count,true,true,true,true,true,true);
end $$;
select * from workspace_admin_smoke_results;
rollback;
