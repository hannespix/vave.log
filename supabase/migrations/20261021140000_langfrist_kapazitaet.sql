-- M11: Langfrist-Kapazität. Der Restbedarf eines Projekts ist geplanter Aufwand
-- (Finanzplanung, sonst Zeitbudget) minus aller bisher gebuchten Zeit. Diese
-- Sicht liefert die gebuchten Minuten je Projekt über die gesamte Historie mit
-- den Rechten der aufrufenden Person (security_invoker).
create view public.project_effort with (security_invoker=true) as
  select workspace_id, project_id, sum(minutes)::integer as minutes, count(*)::integer as entries, min(work_date) as first_work_date, max(work_date) as last_work_date
  from public.time_entries group by workspace_id, project_id;
revoke all on public.project_effort from public,anon,authenticated;
grant select on public.project_effort to authenticated;
