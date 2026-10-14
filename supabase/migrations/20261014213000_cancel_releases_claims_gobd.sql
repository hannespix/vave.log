-- M1-D: Storno gibt fakturierte Zeiten frei, GoBD-Löschsperre für Workspaces.
-- (1) finance_cancel_invoice löscht die finance_time_claims der stornierten
--     Rechnung: die Zeiten sind danach wieder abrechenbar und lassen sich mit
--     revoke_approval in den Entwurf zurückholen. Vorher blieben sie für immer
--     „fakturiert", obwohl der Storno die Rechnung neutralisiert hat.
-- (2) delete_workspace weist das Löschen eines Nicht-Demo-Workspace ab, solange
--     ausgestellte Rechnungen oder Stornos existieren (GoBD/§ 147 AO:
--     Aufbewahrungspflicht — die App darf nicht die einzige Kopie vernichten).
--     Demo-Workspaces (Zeile in workspace_demos) bleiben löschbar.
-- (3) list_owned_workspaces nennt zusätzlich issued_invoices, damit die
--     Oberfläche die Sperre vor dem Versuch erklären kann.
create or replace function private.finance_cancel_invoice(p_workspace_id uuid,p_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.finance_invoices; existing uuid; new_id uuid:=gen_random_uuid(); v_number text; negative_lines jsonb; released integer;
begin
 perform private.finance_assert_can_issue(p_workspace_id);
 perform 1 from public.workspaces where id=p_workspace_id for update;
 perform private.finance_assert_can_issue(p_workspace_id);
 select * into d from public.finance_invoices where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status<>'issued' then raise exception 'FINANCE_CONFLICT'; end if;
 select id into existing from public.finance_invoices where cancellation_of=p_id;
 if found then return private.finance_invoice_json(p_workspace_id,existing); end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'FINANCE_VALIDATION'; end if;
 v_number:=private.finance_next_number(p_workspace_id,d.issuer_snapshot->>'invoice_prefix');
 select jsonb_agg(l||jsonb_build_object('quantity',-(l->>'quantity')::numeric,'net_minor',-(l->>'net_minor')::bigint,'tax_minor',-(l->>'tax_minor')::bigint,'total_minor',-(l->>'total_minor')::bigint)) into negative_lines from jsonb_array_elements(d.lines) l;
 insert into public.finance_invoices(id,workspace_id,client_id,project_id,status,number,currency,language,issue_date,due_date,service_from,service_to,notes,payment_instructions,lines,net_minor,tax_minor,total_minor,issuer_snapshot,customer_snapshot,issued_at,cancellation_of,cancellation_reason)
 values(new_id,p_workspace_id,d.client_id,d.project_id,'cancellation',v_number,d.currency,d.language,current_date,current_date,d.service_from,d.service_to,d.notes,d.payment_instructions,negative_lines,-d.net_minor,-d.tax_minor,-d.total_minor,d.issuer_snapshot,d.customer_snapshot,now(),p_id,btrim(p_reason));
 -- Der Storno neutralisiert die Rechnung: die Zeiten sind nicht mehr abgerechnet.
 delete from public.finance_time_claims where workspace_id=p_workspace_id and invoice_id=p_id;
 get diagnostics released = row_count;
 perform private.audit(p_workspace_id,'finance_cancel','invoice',new_id,jsonb_build_object('number',v_number,'original_id',p_id,'released_time_entries',released));
 return private.finance_invoice_json(p_workspace_id,new_id);
end $$;

create or replace function private.list_owned_workspaces() returns jsonb
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
   'running_timers',(select count(*) from public.running_timers t where t.workspace_id=w.id),
   'issued_invoices',case when d.workspace_id is null then (select count(*) from public.finance_invoices i where i.workspace_id=w.id and i.status in ('issued','cancellation')) else 0 end
  ) summary
  from public.memberships m join public.workspaces w on w.id=m.workspace_id
  left join public.workspace_demos d on d.workspace_id=w.id
  where m.user_id=v_user and m.auth_user_id=v_user and not m.is_demo and m.role='owner'
 ) q;
 return v_result;
end $$;

create or replace function private.delete_workspace(p_workspace_id uuid,p_confirmation_name text,p_confirmed boolean) returns void
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
 -- Ausgestellte Rechnungen und Stornos sind aufbewahrungspflichtige
 -- Geschäftsunterlagen (GoBD/§ 147 AO). Ein Nicht-Demo-Workspace mit solchen
 -- Belegen lässt sich nicht löschen; Demo-Workspaces tragen nur Beispieldaten.
 if not exists(select 1 from public.workspace_demos where workspace_id=p_workspace_id)
  and exists(select 1 from public.finance_invoices where workspace_id=p_workspace_id and status in ('issued','cancellation')) then
  raise exception 'WORKSPACE_ADMIN_GOBD_RECORDS';
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
