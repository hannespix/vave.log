-- M10: Kapazitäts-Cockpit. Der Restaufwand einer Aufgabe ist Schätzung minus
-- bereits gebuchte Zeit über die gesamte Historie – die Oberfläche lädt Zeiten
-- aber nur im gewählten Zeitraum. Diese Sicht liefert die gebuchten Minuten je
-- Aufgabe; sie läuft mit den Rechten der aufrufenden Person (security_invoker),
-- also sehen Mitglieder nur eigene Zeiten, die Leitung das ganze Team.
create view public.task_effort with (security_invoker=true) as
  select workspace_id, task_id, sum(minutes)::integer as minutes, count(*)::integer as entries, max(work_date) as last_work_date
  from public.time_entries where task_id is not null group by workspace_id, task_id;
revoke all on public.task_effort from public,anon,authenticated;
grant select on public.task_effort to authenticated;
