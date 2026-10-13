# International agency workspace implementation plan

> **For agentic workers:** Use the dispatching-parallel-agents workflow for independent file-owned localization/backend modules and native integration. A fresh reviewer checks the combined result before release.

**Goal:** A trilingual role-aware agency workspace with protected planning, costs and invoice generation.
**Architecture:** Keep existing workflows, add pure i18n, isolated finance tables/services/screens, and extend the same MCP authorization boundary. Additive migrations; immutable issued invoice snapshots.
**Tech Stack:** React, TypeScript, Supabase/PostgreSQL, Zod, MCP SDK, Vitest/PGlite, Playwright CI, Sites Worker.
**Spec:** `docs/superpowers/specs/2026-10-13-agency-expansion.md`.

## Global constraints
- User authorized autonomous design, main merge and deployment; preserve owner-private hosting.
- Locales en/de/zh, first system language matching de/zh otherwise English, persistent override and visible switcher.
- Managers/owners only for financial data, owner-only billing identity writes; no service-role key.
- Preserve existing data and financial snapshots; no automatic email send or payment.
- No local browser installation/preview in managed Sites; remote browser CI is available.
- Follow separate file ownership; do not commit another worker's changes. Root coordinates commits/integration.

## Review focus
1. Financial fields leaking through ordinary project/membership reads or stale UI after role changes.
2. Mixed currency precision, rounding, unknown rates silently treated as zero.
3. Duplicate/concurrent finalization or billing the same approved time twice.
4. Customer/company changes altering issued invoice contents or cancellation without history.
5. Locale changes leaving forms/errors/exports in German or translating user data.

### Task 1: Localization and role navigation
Files: `src/shared/i18n.ts`, `src/web/i18n.tsx`, existing `src/web/{main,auth,workspace,components,helpers,Logo}` and dedicated i18n tests; localized UI styles may be appended in separate file. Do not edit finance files or shared service/mcp.
Interface: export `Locale = 'en'|'de'|'zh'`, pure `resolveLocale(language:string):Locale`, `translate(message:string,locale:Locale,values?:Record<string,string|number>):string`; web `useI18n():{locale:Locale,t:(message:string,values?:Record<string,string|number>)=>string,setLocale:(locale:Locale|'system')=>void}` and `LanguageSwitcher`. Communicate any extra APIs promptly. Root integrates FinanceArea into workspace after handoff.
- [x] Write locale fallback/persistence and representative translation tests, observe failing result.
- [x] Add complete catalogs and refactor all existing user-facing text, placeholders/aria, dynamic strings, dates/numbers/CSV/errors, html.lang and email `data.locale`; keep user content untouched.
- [x] Streamline role navigation: manager/owner team controls, member own data; reserve finance navigation integration for root.
- [x] Update existing frontend/e2e assertions for default English, explicit German and Chinese; browser tests are run in CI only.
- [x] Run locale/front-end unit tests and typecheck. Record actual results and remaining integration requirements.

### Task 2: Protected finance backend and calculations
Files: new finance shared types/validation/service/math, one CLI-generated migration, new `tests/finance-database.test.ts` and finance unit/service tests. Do not edit existing web, MCP, email or existing migration files.
Interface: export `createFinanceService(client:SupabaseClient)` and `FinanceService`; exact methods/types documented in `docs/finance-contract.md` before UI work: list/save clients, get/save profile, list/save rates, get/save project plan (incl lines), list/save/delete expenses, overview, list/get/save invoice draft, draft from approved time, issue/cancel/set paid. Use `workspace_id` consistently. Return DB snake_case. All security-sensitive transitions are RPCs, no draft status bypass. English controlled errors; caller locale maps known codes.
- [x] Publish exact service/type/RPC contract early, then write failing real PostgreSQL tests for role/tenant boundaries and invoice immutability/numbering/duplicate billing.
- [x] Implement additive schema/RLS/composite FKs/indexes with pinned search_path for privileged RPCs and revoked anon execution; audit invoice transitions. Keep manager reads separate from member data.
- [x] Implement integer minor-unit finance math and strict Zod inputs. Tests: 60 minutes × 7500 minor = 7500; all hours cost, only billable hours revenue; partial work forecast excludes double count; unknown costs explicitly incomplete; 19% tax rounds deterministically; invalid quantities/dates/extra status fields rejected.
- [x] Implement atomic, idempotent issue/cancel, immutable snapshots and time billing claims; retain zero-tax explanation and service dates. Number allocation protected from direct writes and multi-session races.
- [x] Run new finance DB/math tests and existing database tests. Do not apply live migration; root does this after review.

### Task 3: Finance workspace UI and documents
Files: `src/web/finance/` screens, separate CSS, multilingual finance catalog, safe printable invoice/CSV functions and output tests. Consume backend contract from Task 2 and locale from Task 1; do not edit existing workspace.tsx.
Interface: export `FinanceArea({client,workspace,members,projects,role})`; own internal tabs Overview/Clients/Planning/Invoices/Company. Root mounts only for manager/owner. Finance labels use en/de/zh according to useI18n; if APIs are pending use the documented signatures and coordinate.
- [x] Add failing tests for money/tax/escaped invoice output and source-data handling, then implement.
- [x] Deliver persisted customer forms, effective cost/bill rates plus annual-cost helper, project estimates and expenses with clear totals/remaining work/missing-rate warnings.
- [x] Deliver draft line editor, draft-from-approved-time action, explicit issue/cancel/payment confirmation and safe print/save-PDF/CSV using frozen invoice language and snapshot.
- [x] Accessible responsive layout matching existing VAVE branding; no sensitive finance fetch for member/disabled. Account-dependent integrations described honestly.
- [x] Run unit/type checks; report exact state; root performs role integration and CI browser flows.

### Task 4: Email languages, MCP, role integration and exports
Root owns new server/finance-mcp.ts, src/server/mcp.ts, scripts/build-auth-emails.mjs, output templates, docs, final workspace integration and calendar snapshot export after Task 1 handoff.
- [x] Extend tests for localized email branches/English fallback, finance MCP method registration/read vs write hints, no sensitive-data leaks, escaped CSV/ICS.
- [x] Generate 13 email types × 3 languages plus conditional Supabase templates from locale metadata; preserve confirmation URLs/OTP and existing SMTP activation limitation.
- [x] Register finance MCP tools with strict schemas, English default, optional locale, user-scoped FinanceService and deliberate issue/cancel wording. Do not weaken existing auth.
- [x] Mount manager finance navigation, keep member view streamlined, add honest integration settings and deadline ICS snapshots.
- [x] Run npm check; fix errors; run independent combined security review.

### Task 4b: Public-source example workspace
Files: new shared demo manifest/service, additive migration after agency_finance, dedicated database tests; root owns web demo UI and MCP integration.
- [x] Research official VAVE studios, project/client metadata and public leadership with sources; avoid unsupported current employment/financial assumptions.
- [x] Atomic idempotent demo creation, default empty choice, locale-aware phase labels, fictional finances and creator-only draft time.
- [x] Source reference panel and persistent fictional-data banner; public people never become accounts or permissions.
- [x] Database blocks demo invoice finalization; original creator/owner can archive only the marked demo. Cross-workspace/role/archive tests.

### Task 5: Live verification and release
- [x] Apply additive migration to project ieeujtmpxqxmfyietqgw after schema tests/review. Match actual remote migration version locally. Run advisors and real transactional rollback smoke tests.
- [ ] Commit coherent checkpoints and update GitHub main using expected SHA; inspect CI, including locale/role/invoice browser cases.
- [ ] Merge worktree into original checkout, build Worker, use existing Sites source credential/helper, publish owner-private and inspect terminal deployment state.
- [ ] Update STATE.md and operational limitations. Deliver deployed URL, shipped scope and real setup blockers (SMTP/OAuth/accounting) without claiming unverified production readiness.
