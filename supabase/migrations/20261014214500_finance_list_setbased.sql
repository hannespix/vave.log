-- M2-E: Die Rechnungsliste rechnete je Rechnung einzeln (finance_invoice_json
-- mit Manager-Check plus zwei Unterabfragen pro Dokument — ein klassisches
-- N+1). Jetzt baut ein set-basierter Durchlauf mit zwei LEFT JOINs dasselbe
-- JSON: ein Manager-Check, ein Scan. Zahlungsstatus ist über den
-- UNIQUE-Konflikt von finance_payments(invoice_id) eindeutig, ein Storno je
-- Rechnung über die FOR-UPDATE-Serialisierung in finance_cancel_invoice.
-- finance_invoice_json bleibt für Einzelabrufe (finance_get_invoice) bestehen.
create or replace function private.finance_list_invoices(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_manager(p_workspace_id);
 if (select count(*) from public.finance_invoices where workspace_id=p_workspace_id)>1000 then raise exception 'FINANCE_LIMIT'; end if;
 return coalesce((
  select jsonb_agg(to_jsonb(i)||jsonb_build_object('paid',coalesce(p.paid,false),'cancellation_id',c.id) order by i.created_at desc,i.id)
  from public.finance_invoices i
  left join public.finance_payments p on p.invoice_id=i.id
  left join public.finance_invoices c on c.cancellation_of=i.id
  where i.workspace_id=p_workspace_id),'[]');
end $$;
