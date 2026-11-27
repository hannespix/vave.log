-- Invalidate a draft if any source is no longer eligible at issuance, and hold
-- every source row until the immutable invoice and its claims are committed.
create or replace function private.finance_issue_invoice(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 d public.finance_invoices;
 profile public.finance_billing_profiles;
 customer public.finance_clients;
 source_ids uuid[];
 locked_sources bigint;
 raw_lines jsonb;
 calculated jsonb;
 v_number text;
 curr text;
begin
 perform private.finance_assert_can_issue(p_workspace_id);
 select currency into curr from public.workspaces where id=p_workspace_id for update;
 perform private.finance_assert_can_issue(p_workspace_id);
 select * into d from public.finance_invoices where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if d.status='issued' then return private.finance_invoice_json(p_workspace_id,p_id); end if;
 if d.status<>'draft' then raise exception 'FINANCE_CONFLICT'; end if;

 select array(
  select distinct source.id
  from jsonb_array_elements(d.lines) l
  cross join lateral (
   select (l->>'time_entry_id')::uuid as id where l->>'time_entry_id' is not null
   union all
   select value::uuid from jsonb_array_elements_text(
    case when jsonb_typeof(l->'time_entry_ids')='array' then l->'time_entry_ids' else '[]'::jsonb end
   )
  ) source
 ) into source_ids;

 -- Lock even a source that has since become draft. Taking locks by immutable ID
 -- makes the order independent of the line order and grouping in the draft.
 perform e.id from public.time_entries e
 where e.workspace_id=p_workspace_id and e.id=any(source_ids)
 order by e.id for update;
 get diagnostics locked_sources=row_count;
 if locked_sources<>cardinality(source_ids) or exists(
  select 1 from public.time_entries e
  where e.workspace_id=p_workspace_id and e.id=any(source_ids)
   and (e.project_id is distinct from d.project_id or e.status<>'approved' or not e.billable
        or e.work_date not between d.service_from and d.service_to)
 ) then
  raise exception 'FINANCE_VALIDATION';
 end if;

 select * into profile from public.finance_billing_profiles where workspace_id=p_workspace_id;
 select * into customer from public.finance_clients where workspace_id=p_workspace_id and id=d.client_id;
 -- Missing fictional billing details exist only in the issued demo snapshot.
 if d.is_demo then
  profile.workspace_id:=p_workspace_id;
  profile.legal_name:=coalesce(nullif(profile.legal_name,''),'DEMO Studio');
  profile.billing_address:=coalesce(nullif(profile.billing_address,''),case d.language when 'de' then 'Fiktive Demoadresse' when 'zh' then '虚构演示地址' else 'Fictional demo address' end);
  profile.tax_id:='DEMO-NOT-VALID';
  profile.payment_details:=private.demo_invoice_notice(d.language);
  profile.invoice_prefix:='DEMO';
  profile.footer:=private.demo_invoice_notice(d.language);
  customer.billing_address:=coalesce(nullif(customer.billing_address,''),profile.billing_address);
 end if;
 if profile.workspace_id is null or length(btrim(profile.legal_name))=0 or length(btrim(profile.billing_address))=0 or length(btrim(profile.tax_id))=0 or length(btrim(customer.billing_address))=0 then
  raise exception 'FINANCE_CONFIGURATION';
 end if;

 select coalesce(jsonb_agg(value-'net_minor'-'tax_minor'-'total_minor'-'minutes' order by position),'[]')
 into raw_lines from jsonb_array_elements(d.lines) with ordinality as line(value,position);
 calculated:=private.finance_build_lines(p_workspace_id,d.project_id,raw_lines,true);
 v_number:=private.finance_next_number(p_workspace_id,profile.invoice_prefix);
 update public.finance_invoices
 set status='issued',number=v_number,currency=curr,lines=calculated,issuer_snapshot=to_jsonb(profile),customer_snapshot=to_jsonb(customer),issued_at=now(),
     net_minor=(select sum((l->>'net_minor')::bigint) from jsonb_array_elements(calculated) l),
     tax_minor=(select sum((l->>'tax_minor')::bigint) from jsonb_array_elements(calculated) l),
     total_minor=(select sum((l->>'total_minor')::bigint) from jsonb_array_elements(calculated) l)
 where id=p_id;
 insert into public.finance_time_claims(workspace_id,time_entry_id,invoice_id)
 select p_workspace_id,source.id,p_id from unnest(source_ids) source(id) order by source.id;
 perform private.audit(p_workspace_id,'finance_issue','invoice',p_id,jsonb_build_object('number',v_number));
 return private.finance_invoice_json(p_workspace_id,p_id);
end $$;

-- Receipts outlive a removed payment, so a delayed retry cannot recreate it.
-- The invoice FK still removes receipts when a workspace is deliberately deleted.
create table private.finance_payment_receipts (
 workspace_id uuid not null,
 operation_id uuid not null,
 invoice_id uuid not null,
 actor_id uuid not null,
 paid_on date not null,
 amount_minor bigint not null,
 note_hash bytea not null,
 primary key(workspace_id,operation_id),
 foreign key(workspace_id,invoice_id) references public.finance_invoices(workspace_id,id) on delete cascade
);
alter table private.finance_payment_receipts enable row level security;
revoke all on table private.finance_payment_receipts from public,anon,authenticated;
create index finance_payment_receipts_invoice on private.finance_payment_receipts(workspace_id,invoice_id);

create function private.finance_record_payment(
 p_workspace_id uuid,p_invoice_id uuid,p_paid_on date,p_amount_minor bigint,p_note text,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 receipt private.finance_payment_receipts;
 actor uuid:=auth.uid();
 payment_note text:=btrim(p_note);
 payment_note_hash bytea:=sha256(convert_to(payment_note,'UTF8'));
begin
 perform private.finance_require_manager(p_workspace_id);
 if p_operation_id is null or p_paid_on is null or p_paid_on not between date '2000-01-01' and date '2100-12-31'
    or p_amount_minor is null or p_amount_minor not between 1 and 9000000000000
    or p_note is null or length(p_note)>500 then
  raise exception 'FINANCE_VALIDATION';
 end if;
 perform 1 from public.finance_invoices
 where workspace_id=p_workspace_id and id=p_invoice_id and status='issued' for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 perform private.finance_require_manager(p_workspace_id);

 insert into private.finance_payment_receipts(workspace_id,operation_id,invoice_id,actor_id,paid_on,amount_minor,note_hash)
 values(p_workspace_id,p_operation_id,p_invoice_id,actor,p_paid_on,p_amount_minor,payment_note_hash)
 on conflict(workspace_id,operation_id) do nothing;
 if not found then
  select * into strict receipt from private.finance_payment_receipts
  where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if (receipt.invoice_id,receipt.actor_id,receipt.paid_on,receipt.amount_minor,receipt.note_hash)
     is distinct from (p_invoice_id,actor,p_paid_on,p_amount_minor,payment_note_hash) then
   raise exception 'FINANCE_CONFLICT';
  end if;
  return private.finance_invoice_json(p_workspace_id,p_invoice_id);
 end if;
 insert into public.finance_invoice_payments(workspace_id,invoice_id,paid_on,amount_minor,note)
 values(p_workspace_id,p_invoice_id,p_paid_on,p_amount_minor,payment_note);
 perform private.finance_sync_paid(p_workspace_id,p_invoice_id);
 perform private.audit(p_workspace_id,'finance_payment','invoice',p_invoice_id,jsonb_build_object('amount_minor',p_amount_minor,'paid_on',p_paid_on));
 return private.finance_invoice_json(p_workspace_id,p_invoice_id);
end $$;

-- Preserve pre-existing callers. New callers send the same ID for one operation.
create or replace function private.finance_record_payment(
 p_workspace_id uuid,p_invoice_id uuid,p_paid_on date,p_amount_minor bigint,p_note text
) returns jsonb language sql security definer set search_path='' as $$
 select private.finance_record_payment(p_workspace_id,p_invoice_id,p_paid_on,p_amount_minor,p_note,gen_random_uuid())
$$;
create function public.finance_record_payment(
 p_workspace_id uuid,p_id uuid,p_paid_on date,p_amount_minor bigint,p_note text,p_operation_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
 select private.finance_record_payment(p_workspace_id,p_id,p_paid_on,p_amount_minor,p_note,p_operation_id)
$$;
revoke all on function
 private.finance_record_payment(uuid,uuid,date,bigint,text,uuid),public.finance_record_payment(uuid,uuid,date,bigint,text,uuid)
 from public,anon,authenticated;
grant execute on function
 private.finance_record_payment(uuid,uuid,date,bigint,text,uuid),public.finance_record_payment(uuid,uuid,date,bigint,text,uuid)
 to authenticated;

-- Retain the one-argument RPC for existing clients. The extended RPC returns
-- one bounded page in the same order, with identical invoice/payment fields.
create index finance_invoices_workspace_page on public.finance_invoices(workspace_id,created_at desc,id);
create function private.finance_list_invoices(
 p_workspace_id uuid,p_page_size integer,p_before_created_at timestamptz,p_before_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_view(p_workspace_id);
 if p_page_size is null or p_page_size not between 1 and 100
    or (p_before_created_at is null)<>(p_before_id is null) then
  raise exception 'FINANCE_VALIDATION';
 end if;
 return coalesce((
  select jsonb_agg(to_jsonb(i)||jsonb_build_object(
   'paid',coalesce(p.paid,false),'cancellation_id',c.id,'paid_minor',coalesce(ip.paid_minor,0),'payments',coalesce(ip.payments,'[]'::jsonb)
  ) order by i.created_at desc,i.id)
  from (
   select * from public.finance_invoices d
   where d.workspace_id=p_workspace_id and (
    p_before_created_at is null or
    (d.created_at<=p_before_created_at and (d.created_at<>p_before_created_at or d.id>p_before_id))
   )
   order by d.created_at desc,d.id limit p_page_size
  ) i
  left join public.finance_payments p on p.invoice_id=i.id
  left join public.finance_invoices c on c.cancellation_of=i.id
  left join lateral (
   select sum(x.amount_minor) as paid_minor,jsonb_agg(to_jsonb(x) order by x.paid_on,x.created_at,x.id) as payments
   from public.finance_invoice_payments x where x.workspace_id=p_workspace_id and x.invoice_id=i.id
  ) ip on true
 ),'[]'::jsonb);
end $$;
create function public.finance_list_invoices(
 p_workspace_id uuid,p_page_size integer,p_before_created_at timestamptz,p_before_id uuid
) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.finance_list_invoices(p_workspace_id,p_page_size,p_before_created_at,p_before_id)
$$;
revoke all on function
 private.finance_list_invoices(uuid,integer,timestamptz,uuid),public.finance_list_invoices(uuid,integer,timestamptz,uuid)
 from public,anon,authenticated;
grant execute on function
 private.finance_list_invoices(uuid,integer,timestamptz,uuid),public.finance_list_invoices(uuid,integer,timestamptz,uuid)
 to authenticated;
