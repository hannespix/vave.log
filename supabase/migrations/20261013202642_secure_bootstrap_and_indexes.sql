-- The Dashboard's automatic-RLS event trigger must not be a callable API.
-- Keep the trigger itself enabled; local/test databases may not install it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Cover foreign-key lookups reported by the live Supabase advisor.
create index workspaces_created_by on public.workspaces(created_by);
create index invitations_invited_by on public.invitations(invited_by);
create index tasks_created_by on public.tasks(created_by);
create index time_entries_workspace_user on public.time_entries(workspace_id,user_id);
create index audit_log_actor on public.audit_log(actor_id);
create index timer_receipts_workspace on private.timer_receipts(workspace_id);
