# Automatic demo planning experience v5

Apply `20261014102144_demo_project_planning.sql`, then `20261014102151_task_progress_milestones.sql`. The first adds missing legacy project planning; the second adds task estimates, milestones, complete insight aggregates and the v5 demo upgrade. The public research manifest stays at v3 because its facts and attribution have not changed.

New demos contain 25 projects, 102 estimated tasks and 33 milestones. Existing active v4 demos receive only eligible missing task metadata and advance to v5 during migration. Historical v1/v2 demos retain their version until the ordinary owner upgrade adds the remaining portfolio and finishes at v5. The existing creation request token and repeated v5 upgrades remain no-ops.

## Automatic progress and detail

The primary progress calculation uses task data, independent of stored manual percentages and the time-report filter:

- When every task has a valid positive estimate, progress is completed estimated minutes divided by all estimated minutes.
- If any estimate is missing, the explicit fallback is completed task count divided by all task count.
- A project without tasks has unknown progress. An in-progress task receives no invented partial completion credit.
- Milestones are a subset of tasks, never additional progress weight. Their complete totals and the first 12 items are returned, ordered unfinished first, then deadline (undated last), title and ID.
- The snapshot reports total, done, doing, overdue, estimated-task count, total estimated minutes, completed estimated minutes, missing estimates, missing deadlines and unassigned tasks. Missing deadlines and assignments count all tasks.

`public.project_insight` remains a stable, security-invoker, manager/owner-only RPC. RLS and explicit workspace/project filters still apply. Actual effort includes all recorded team time through the workspace-local date; future work and active timers are excluded. Task-state edits appear in the next snapshot immediately. Manual project progress and its server-owned timestamp remain stored for compatibility and are ignored by the primary forecast.

Task input adds optional `estimated_minutes` (null or integer 1–6,000,000) and optional `is_milestone` (boolean, database default false). Omission preserves old callers. Existing task membership permissions and identity guards remain unchanged; no new role obtains access.

## Demo scenarios

Seed estimates are fictional planned work, generated once. For pristine projects they sum to the existing hours budget. Completed tasks receive a coherent share of that estimate, with the remainder allocated to unfinished tasks. Subsequent progress comes from task completion rather than a stored demo percentage.

Nine of the twelve enterprise projects forecast both within their hours budget and before their deadline. CULT26 forecasts a deadline miss, LEAP27 is overdue, and AERO26 forecasts an hours overrun. TIDE26 and THREAD26 add smaller healthy examples. MOVE26 retains its deliberately exceeded budget. MAT27 remains paused. SIGNAL26 remains archived with unfinished work: its automatic progress is 35%, even though its retained legacy manual value was 100%. The eight active reference projects show 95% estimated completion; their original budget overruns and unfinished tasks remain visible.

Example fresh seed on 2026-10-14; exact hours and dates follow the workspace-local seed date:

| Project | Logged hours | Budget hours | Automatic progress | Projected hours | Outlook |
| --- | ---: | ---: | ---: | ---: | --- |
| NOVA26 | 2,049.0 | 8,500 | 29% | 7,065.5 | Within budget; deadline 28 days after forecast |
| CULT26 | 2,044.5 | 10,000 | 25% | 8,178.0 | Within budget; forecast 21 days late |
| LEAP27 | 2,017.5 | 12,000 | 20% | 10,087.5 | Within budget; deadline seven days overdue |
| AERO26 | 2,008.5 | 12,000 | 14% | 14,346.4 | Budget overrun; deadline 28 days after forecast |
| TIDE26 | 84.0 | 266.7 | 38% | 221.1 | Within budget and deadline |
| MOVE26 | 95.8 | 8.0 | 35% | 273.6 | Existing budget overrun and late forecast |
| MAT27 | 103.0 | 316.7 | 40% | 257.5 | Paused; no completion-date forecast |
| SIGNAL26 | 87.5 | 333.3 | 35% | 250.0 | Archived; unfinished work stays visible |

These are fictional operations, not claims about the real referenced projects. Old demos without recent time retain that history; forecasts correctly report missing pace rather than inventing new work.

## Preservation and provenance

Project deadline and legacy progress are filled independently only when null. The existing database guard owns every progress timestamp and does not restamp progress when only a deadline is added. Budgets, project status, task content/status/dates/assignments, recorded time, people, rates, clients, expenses, plans, invoices and payments are retained. No auth accounts are created.

Eligible seed projects require their manifest code/name/client, original create audit, matching workspace seed event, same-transaction finance plan/client and same-transaction seed time. Renamed identities are conservatively skipped; a familiar code alone is insufficient.

Task metadata requires an exact localized phase or original owner-task title, the original creator/create audit, and the matching seed transaction. Any task with an update audit is skipped, protecting user estimates, explicit milestone choices, changed status/dates and deliberately cleared values. Duplicate matching phases are considered ambiguous and skipped rather than picking an arbitrary user-added lookalike. Metadata backfill is private and invoker-only; public upgrades retain verified creator/owner authorization and locking. Tasks are locked before selecting weights to serialize against edits.

Archived demos and unmarked real workspaces are excluded. A completed v5 upgrade never restores later-cleared estimates or milestones. User-modified or incomplete samples may legitimately use the task-count fallback instead of the pristine scenario weights.

## Verification and rollout

The database suites exercise the actual migrations, RPCs, privileges, RLS, constraints and timestamp guard in PGlite. The v5 demo suite imports the production automatic forecast helper, covers live state-driven progress and validates the nine healthy enterprise scenarios. The historical v4 suite is deliberately isolated before v5 and tests only its retained planning/preservation contract.

After applying both migrations, run the exact privileged, rollback-only `tests/live/demo-planning-smoke.sql`. It reuses a confirmed account and creates no auth users. It verifies a new v5 sample, reconstructs a historical v3 sample, exercises both null-only helpers and the public upgrade, preserves supplied project/task data and all other business content, checks real/archived-workspace boundaries and private helper privileges, and changes a milestone to prove live progress aggregation. Expected summary:

```json
{"new_planned_projects":25,"healthy_enterprise_projects":9,"existing_planned_projects":24,"retry_changed_projects":0,"preserved_business_records":true,"unchanged_auth_users":true,"estimated_tasks":102,"milestones":33,"automatic_updates_verified":true}
```

The existing count of 24 excludes one project with both planning fields already supplied. All scenario arithmetic uses completed task estimates. The script prints the 25 scenarios and rolls back every sample, edit and audit event. `tests/demo-planning-live-smoke.test.ts` executes that exact SQL locally and checks that no samples remain. The existing project-insight live smoke also verifies the extended task/milestone aggregates.

Live execution and post-migration Supabase security/performance advisors are deployment checks. Supabase changelog and current function/security documentation were reviewed before implementation; this change introduces no extension indexes, custom operators, encrypted data or HTTP/TLS behavior affected by the current notices.
