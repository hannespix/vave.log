-- Cover composite references identified by the live Supabase advisor.
create index finance_invoices_workspace_cancellation
  on public.finance_invoices(workspace_id, cancellation_of);
create index finance_time_claims_workspace_entry
  on public.finance_time_claims(workspace_id, time_entry_id);
