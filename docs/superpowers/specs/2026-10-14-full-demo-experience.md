# Full VAVE demo agency

User correction: sample data must populate the actual tool, not a gallery of source references. Use verified public people/project names, add plausible fictional staff/projects, and show the breadth of work, finance and reports. The colored logo dot belongs between VAVE and LOG; remove the literal dot and trailing dot. Autonomous design, merge and publication remain authorized.

## Experience
A marked, separate EUR demo workspace contains all verified VAVE contributors collected from official project credits (their historical public title is context, not a current employment claim), plus invented employees/freelancers and four or more plausible invented clients/projects. People appear in Team, task assignment, time reports, rates and planning. Current and recent weeks include draft/submitted/approved, billable/nonbillable time; tasks cover statuses/deadlines; projects cover active/paused/archived, hourly/fixed/internal, healthy/over-budget. Include expenses, complete clearly fictional company/client details, estimates and draft/issued/paid/overdue/cancelled invoices. Creation and optional enrichment of existing demos are atomic and idempotent. Do not delete or overwrite user-entered demo data during enrichment. Empty real workspaces are never enriched.

A concise multilingual demo banner replaces the source gallery. Sources remain developer provenance documentation. Demo data is clearly fictional in operational/financial contexts. Existing demos get a one-click complete-demo action. New demos are complete immediately. Native normal forms/RPCs remain usable. Timer can be started interactively; do not create a live timer for the authenticated owner automatically. Do not pretend external OAuth/accounting integrations are connected.

## Identity and security
Demo people are workspace membership identities with is_demo=true, never auth.users records, credentials, invitations to real people or login identities. Keep the existing real-account FK guarantee through a generated auth_user_id column (NULL for demo identities, user_id otherwise) with FK to auth.users. Restrict sample identities to marked demo workspaces, forbid demo owner role, make flags/identity immutable, and ensure current_role explicitly excludes demo memberships. Real workspace security and same-workspace composite FKs remain intact. No privileged runtime credentials.

Demo issuance is enabled, with immutable database-controlled is_demo on every invoice, guaranteed DEMO-prefixed numbers and persistent no-payment markings in snapshots/output. A client cannot turn sample documents into real invoices. Ordinary invoice authorization, numbering, idempotency, immutability and claims remain enforced. Printed/PDF/CSV/UI documents mark DEMO in en/de/zh. Demo invoice setting cannot be supplied through draft payloads. Ordinary real invoices stay unchanged.

## Shared contract
Membership adds optional is_demo:boolean, demo_title:string, demo_studio:string, demo_origin:'public'|'fictional'|null (optional in TS to retain existing fixtures).
Invoice adds optional is_demo:boolean (returned by SQL; absent legacy fixtures treated false).
DemoWorkspace adds optional experience_version:number; version2 means fully seeded.
DemoService.upgrade(workspaceId):Promise<void> calls demo_upgrade_workspace(p_workspace_id), creator/current-owner only, locks/rechecks and idempotent.
New creation preserves existing demo_create_workspace signature/request ID and enriches before return. Existing demo archive guards remain. Metadata is never an auth source.

## Verification
Real PostgreSQL tests for conditional real-account FK, demo membership isolation, auth impersonation denial, sample-only enrichment/issuance/number/persistent marker, cross-tenant references, owner checks, immutability, retries and data preservation. Scenario counts and financial sums across actual service queries; multilingual render/exports; browser journey that opens Team, approvals and finance samples. Final independent review and live rollback smoke before additive migrations/main/deploy. Preserve owner-private hosting.
