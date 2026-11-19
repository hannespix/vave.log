-- Leseregeln einmal je Abfrage statt einmal je Zeile (19.11.2026).
--
-- Feldfall: Im Demo-Workspace mit 5.827 Zeiteinträgen brach das Laden mit „statement timeout“ ab.
-- Jede Leseregel rief je Zeile private.can(workspace_id, …) bzw. private.current_role(workspace_id)
-- auf – rund 0,75 ms je Zeile, also über 4 Sekunden für eine Abfrage über alle Zeiten. Mehrere
-- solche Abfragen gleichzeitig (Zeitenliste, Projektaufwand, Kapazitätsplan) überschritten die
-- Grenze von 8 Sekunden.
--
-- Jetzt ermittelt eine Funktion einmal je Abfrage die Workspaces, in denen die Person Mitglied ist
-- bzw. ein Recht hat; die Regel prüft je Zeile nur noch, ob der Workspace in dieser Menge liegt.
-- Wer was sehen darf, bleibt unverändert: Die Funktionen fragen dieselben Prüfungen wie bisher.

create function private.member_workspaces() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id from public.memberships m
  where m.user_id=(select auth.uid()) and not m.is_demo and private.current_role(m.workspace_id) is not null
$$;
create function private.workspaces_with(p_module text,p_level text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id from public.memberships m
  where m.user_id=(select auth.uid()) and not m.is_demo and private.can(m.workspace_id,p_module,p_level)
$$;
revoke all on function private.member_workspaces(),private.workspaces_with(text,text) from public,anon,authenticated;
grant execute on function private.member_workspaces(),private.workspaces_with(text,text) to authenticated;

-- Mitgliedschaft genügt.
alter policy workspace_read on public.workspaces using (id in (select private.member_workspaces()));
alter policy membership_read on public.memberships using (workspace_id in (select private.member_workspaces()));
alter policy project_read on public.projects using (workspace_id in (select private.member_workspaces()));
alter policy task_read on public.tasks using (workspace_id in (select private.member_workspaces()));
alter policy absences_read on public.absences using (workspace_id in (select private.member_workspaces()));
alter policy demo_read on public.workspace_demos using (workspace_id in (select private.member_workspaces()));
alter policy project_phases_read on public.project_phases using (workspace_id in (select private.member_workspaces()));
alter policy service_types_read on public.service_types using (workspace_id in (select private.member_workspaces()));
alter policy timer_read on public.running_timers using (user_id=(select auth.uid()) and workspace_id in (select private.member_workspaces()));

-- Eigenes immer, das der anderen mit dem passenden Recht.
alter policy entry_read on public.time_entries
  using ((user_id=(select auth.uid()) and workspace_id in (select private.member_workspaces())) or workspace_id in (select private.workspaces_with('time_team','view')));
alter policy vacation_balances_read on public.vacation_balances
  using ((user_id=(select auth.uid()) and workspace_id in (select private.member_workspaces())) or workspace_id in (select private.workspaces_with('absences_team','view')));
alter policy capacity_rows_read on public.capacity_rows
  using (workspace_id in (select private.workspaces_with('planning','view')) or (user_id=(select auth.uid()) and workspace_id in (select private.member_workspaces())));
alter policy capacity_cells_read on public.capacity_cells
  using (workspace_id in (select private.workspaces_with('planning','view')) or row_id in (select r.id from public.capacity_rows r where r.user_id=(select auth.uid())));

-- Nur mit Recht.
alter policy audit_read on public.audit_log
  using (workspace_id in (select private.workspaces_with('team','edit')) or workspace_id in (select private.workspaces_with('settings','edit')));
alter policy invitation_read on public.invitations using (workspace_id in (select private.workspaces_with('team','view')));
alter policy finance_offers_read on public.finance_offers using (workspace_id in (select private.workspaces_with('finance','view')));
do $finance$
declare r record;
begin
  for r in select c.relname from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace s on s.oid=c.relnamespace
           where s.nspname='public' and p.polname='finance_read' and p.polcmd='r' loop
    execute format('alter policy finance_read on public.%I using (workspace_id in (select private.workspaces_with(''finance'',''view'')))',r.relname);
  end loop;
end $finance$;
