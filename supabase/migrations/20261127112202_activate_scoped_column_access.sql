-- Run after the web build uses the scoped read RPCs when upgrading a live instance.
-- For a fresh instance, apply the complete migration chain before publishing.
revoke select on public.tasks, public.memberships, public.absences from public, anon, authenticated;
grant select (id, workspace_id, project_id, title, status, assignee_id, due_date, created_by, created_at,
              estimated_minutes, is_milestone, repeat, tags, started_at, done_at, reopened_count)
  on public.tasks to authenticated;
grant select (workspace_id, user_id, role, display_name, email, created_at, is_demo, demo_title, demo_studio,
              demo_origin, auth_user_id, weekly_capacity_minutes, location, work_schedule, rights_template, permissions)
  on public.memberships to authenticated;
grant select (id, workspace_id, user_id, starts_on, ends_on, kind, status, half_day, created_at)
  on public.absences to authenticated;

-- Der gespeicherte JSON-Schnappschuss enthält Zahlen aus Bereichen mit eigenen Leserechten.
revoke select on public.project_handovers from authenticated;
grant select (id,source_workspace_id,source_project_id,target_workspace_id,target_project_id,status,
  note,offered_by,offered_at,decided_by,decided_at) on public.project_handovers to authenticated;
