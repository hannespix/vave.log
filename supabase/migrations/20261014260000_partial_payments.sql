-- M3-I: Teilzahlungen. Bisher kannte eine Rechnung nur bezahlt/unbezahlt
-- (finance_payments.paid) — eine Abschlagszahlung war unsichtbar und die
-- Überfällig-Kennzahl zählte den vollen Betrag. Jetzt gibt es Zahlungen mit
-- Datum, Betrag und Notiz je Rechnung; der bezahlt-Status wird beim Erfassen
-- und Löschen automatisch nachgeführt (Summe ≥ Brutto ⇒ bezahlt). Der
-- manuelle Schalter finance_set_paid bleibt für Workspaces, die keine
-- Einzelzahlungen erfassen. Schreibwege nur über Definer-RPCs, damit Betrag
-- und Status atomar unter der Rechnungssperre wechseln.
create table public.finance_invoice_payments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 invoice_id uuid not null, paid_on date not null check(paid_on between date '2000-01-01' and date '2100-12-31'),
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 note text not null default '' check(length(note)<=500),
 created_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,invoice_id) references public.finance_invoices(workspace_id,id)
);
create index finance_invoice_payments_invoice on public.finance_invoice_payments(workspace_id,invoice_id);
alter table public.finance_invoice_payments enable row level security;
revoke all on public.finance_invoice_payments from public,anon,authenticated;
grant select on public.finance_invoice_payments to authenticated;
create policy finance_read on public.finance_invoice_payments for select to authenticated using(private.current_role(workspace_id) in ('owner','manager'));

create function private.finance_sync_paid(p_workspace_id uuid,p_invoice_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare covered boolean;
begin
 select coalesce(sum(p.amount_minor),0)>=i.total_minor into covered
 from public.finance_invoices i left join public.finance_invoice_payments p on p.invoice_id=i.id
 where i.workspace_id=p_workspace_id and i.id=p_invoice_id group by i.total_minor;
 insert into public.finance_payments(workspace_id,invoice_id,paid) values(p_workspace_id,p_invoice_id,covered)
 on conflict(invoice_id) do update set paid=excluded.paid,updated_at=now();
end $$;

create function private.finance_record_payment(p_workspace_id uuid,p_invoice_id uuid,p_paid_on date,p_amount_minor bigint,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 perform 1 from public.finance_invoices where workspace_id=p_workspace_id and id=p_invoice_id and status='issued' for update;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 if p_paid_on is null or p_amount_minor is null or p_amount_minor not between 1 and 9000000000000 or p_note is null or length(p_note)>500 then raise exception 'FINANCE_VALIDATION'; end if;
 insert into public.finance_invoice_payments(workspace_id,invoice_id,paid_on,amount_minor,note) values(p_workspace_id,p_invoice_id,p_paid_on,p_amount_minor,btrim(p_note));
 perform private.finance_sync_paid(p_workspace_id,p_invoice_id);
 perform private.audit(p_workspace_id,'finance_payment','invoice',p_invoice_id,jsonb_build_object('amount_minor',p_amount_minor,'paid_on',p_paid_on));
 return private.finance_invoice_json(p_workspace_id,p_invoice_id);
end $$;

create function private.finance_delete_payment(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invoice uuid;
begin
 perform private.finance_require_manager(p_workspace_id);
 select invoice_id into v_invoice from public.finance_invoice_payments where workspace_id=p_workspace_id and id=p_id;
 if not found then raise exception 'FINANCE_NOT_FOUND'; end if;
 perform 1 from public.finance_invoices where workspace_id=p_workspace_id and id=v_invoice for update;
 delete from public.finance_invoice_payments where workspace_id=p_workspace_id and id=p_id;
 perform private.finance_sync_paid(p_workspace_id,v_invoice);
 perform private.audit(p_workspace_id,'finance_payment_delete','invoice',v_invoice,jsonb_build_object('payment_id',p_id));
 return private.finance_invoice_json(p_workspace_id,v_invoice);
end $$;

-- Einzelabruf und Liste tragen die Zahlungssumme und die Einzelzahlungen mit.
create or replace function private.finance_invoice_json(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 perform private.finance_require_manager(p_workspace_id);
 select to_jsonb(i)||jsonb_build_object(
  'paid',coalesce((select paid from public.finance_payments where invoice_id=i.id),false),
  'cancellation_id',(select id from public.finance_invoices where cancellation_of=i.id),
  'paid_minor',coalesce((select sum(p.amount_minor) from public.finance_invoice_payments p where p.invoice_id=i.id),0),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on,p.created_at,p.id) from public.finance_invoice_payments p where p.invoice_id=i.id),'[]'))
 into v from public.finance_invoices i where i.workspace_id=p_workspace_id and i.id=p_id;
 if v is null then raise exception 'FINANCE_NOT_FOUND'; end if; return v;
end $$;

create or replace function private.finance_list_invoices(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 if (select count(*) from public.finance_invoices where workspace_id=p_workspace_id)>1000 then raise exception 'FINANCE_LIMIT'; end if;
 return coalesce((
  select jsonb_agg(to_jsonb(i)||jsonb_build_object('paid',coalesce(p.paid,false),'cancellation_id',c.id,'paid_minor',coalesce(ip.paid_minor,0),'payments',coalesce(ip.payments,'[]'::jsonb)) order by i.created_at desc,i.id)
  from public.finance_invoices i
  left join public.finance_payments p on p.invoice_id=i.id
  left join public.finance_invoices c on c.cancellation_of=i.id
  left join lateral (select sum(x.amount_minor) as paid_minor,jsonb_agg(to_jsonb(x) order by x.paid_on,x.created_at,x.id) as payments from public.finance_invoice_payments x where x.invoice_id=i.id) ip on true
  where i.workspace_id=p_workspace_id),'[]');
end $$;

create function public.finance_record_payment(p_workspace_id uuid,p_id uuid,p_paid_on date,p_amount_minor bigint,p_note text) returns jsonb language sql set search_path='' as $$select private.finance_record_payment(p_workspace_id,p_id,p_paid_on,p_amount_minor,p_note)$$;
create function public.finance_delete_payment(p_workspace_id uuid,p_id uuid) returns jsonb language sql set search_path='' as $$select private.finance_delete_payment(p_workspace_id,p_id)$$;
revoke all on function public.finance_record_payment(uuid,uuid,date,bigint,text),public.finance_delete_payment(uuid,uuid),private.finance_record_payment(uuid,uuid,date,bigint,text),private.finance_delete_payment(uuid,uuid),private.finance_sync_paid(uuid,uuid) from public,anon,authenticated;
-- Die public-Wrapper laufen als Aufrufer und brauchen EXECUTE auf die privaten
-- Definer-Funktionen (die intern require_manager prüfen) — wie die Bestands-RPCs.
grant execute on function public.finance_record_payment(uuid,uuid,date,bigint,text),public.finance_delete_payment(uuid,uuid),private.finance_record_payment(uuid,uuid,date,bigint,text),private.finance_delete_payment(uuid,uuid) to authenticated;
