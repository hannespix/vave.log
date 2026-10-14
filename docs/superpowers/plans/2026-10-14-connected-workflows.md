# Connected Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Independent domains use the dispatching-parallel-agents workflow.

**Goal:** Connect project workflows and show honest effort/deadline scenarios without clutter.
**Architecture:** A workspace navigation controller passes explicit project context to existing views. An invoker RPC aggregates all-time project facts for managers; a pure model and on-demand dialog present forecasts. Existing Supabase permissions remain authoritative.
**Tech Stack:** Existing React/TypeScript, Supabase/Postgres, Vitest/PGlite, Playwright; no new dependencies.
**Spec:** ../specs/2026-10-14-connected-workflows-design.md

## Global Constraints

- EN/DE/ZH, English fallback; preserve branding and Settings-only demo disclosure.
- Owner/manager-only aggregate analysis and finances; never silently broaden invalid project scopes.
- Additive migration; preserve real data and user edits; database owns progress timestamp.
- Last 28 calendar days; minimum 7 observed days and 3 logged dates; stale progress after 14 calendar days.
- Merge to main and deploy exact matching source only after checks pass; owner-private audience.

## Review Focus

- A stale or foreign hash project must not reveal another workspace or become an unfiltered financial view (Task 3).
- A role downgrade must clear manager-only dialog data and prevent aggregate requests (Tasks 1–3).
- Missing/stale progress, no pace and future entries must not produce a reassuring deadline status (Tasks 1–2).
- Modal creation after filtered navigation must save the selected project, including after back navigation (Task 3).
- Small viewports, empty filter results and keyboard/back navigation must remain usable (Tasks 3–4).

### Task 1: Planning persistence and secure aggregation

Files: additive migration; `src/shared/types.ts`, `validation.ts`, `service.ts`, `project-insight-types.ts`; `src/server/mcp.ts`; focused database/service/MCP tests.
Interface: `Service.getProjectInsight(workspaceId:string,projectId:string):Promise<ProjectInsight>` using the exact spec result. Project fields optional nullable for compatibility; progress timestamp read-only.
- [x] Write and run failing tests for manager scope, cross-workspace/member denial, full-history totals, future exclusion, timezone, validation and timestamp/old-client preservation.
- [x] Implement migration, types, service and read-only MCP operation.
- [x] Run focused tests to green and provide a rollback-only live smoke query. Root applies migration after integration.

### Task 2: Forecast model and focused analysis dialog

Files: `src/shared/project-forecast.ts`, `src/web/project-insights.tsx`, `src/web/project-insights.css`, `src/web/project-insight-copy.ts`, focused tests.
Interface: `forecastProject(insight:ProjectInsight)` is a pure model. `ProjectInsightDialog({service,workspaceId,projectId,onClose,onEdit,onNavigate})`; onEdit receives Project; onNavigate receives `'tasks'|'time'|'reports'|'planning'|'invoices'`.
- [x] Write failing model cases for all spec edge conditions and exact arithmetic.
- [x] Implement the pure model and localized dialog with guarded loading, retry, cancellation/stale-request handling, concise metrics and expandable assumptions.
- [x] Verify model/localization with focused tests; no workspace or finance source edits.

### Task 3: Navigation, tasks and project context

Files: workspace integration, focused tasks component, workflow navigation/filter model/copy/styles, editor planning fields; navigation/filter and browser tests.
Interface to FinanceArea: optional `navigation?:{projectId:string;tab:'overview'|'clients'|'planning'|'invoices'|'company';revision:number}`, `onNavigate?:(target:{view:'projects'|'tasks'|'time'|'reports'|'finance';projectId:string;financeTab?:'overview'|'clients'|'planning'|'invoices'|'company'})=>void`. Empty projectId means explicit all projects.
- [x] Test safe navigation hash parse/serialize, scope reset, task filtering and due-date boundaries.
- [x] Implement state/history and replace non-interactive project/task counts with contextual links. Prefill new task/time dialogs; persist deadline/progress in project editor.
- [x] Build tidy task toolbar with search/project/quick filters, progressive advanced filters and clear reset.
- [x] Browser tests: Project → Tasks filtered, project-prefilled new task, filters/reset, back/reload, analysis and member denial, desktop/mobile overflow.

### Task 4: Finance context links

Files: `src/web/finance/*` and finance-focused tests only.
Interface: optional navigation/onNavigate props from Task 3; context owns selected project across finance tabs and exposes project links.
- [x] Test explicit project filtering on overview/planning/invoices, including unavailable IDs never becoming all.
- [x] Add context-aware overview/planning/invoice links and minimal selected-project context/reset. Existing callers and tests remain compatible.
- [x] Run focused finance tests; coordinate return interface with root.

### Task 5: Integration and publication

- [x] Independent review of role/scope/forecast edge cases and localization.
- [x] Run npm run check; apply additive migration and rollback-only live smoke; inspect advisors.
- [ ] Push a reviewable PR; require CI dependency audit and browser tests green. Merge main, package matching Site source and publish. Report actual verified result.
