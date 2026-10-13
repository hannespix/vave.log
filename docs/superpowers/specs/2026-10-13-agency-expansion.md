# VAVE.LOG international agency workspace

The user delegates design and execution, including main integration and deployment. This spec records those decisions without requiring a new approval round. Work proceeds in independently testable localization and finance modules. Preserve the existing VAVE identity and all data. No actual messages, payments or invoices are sent by the coding agent.

## Product decisions

English, German and Simplified Chinese throughout. First browser language determines the default (`de-*` → de, `zh-*` → zh, all others → en). Explicit selection persists locally and overrides the system; a System option restores detection. A visible switcher is available before and after login. Locale changes update `html.lang`, dates, numbers, errors, CSV labels, auth email language metadata and document labels. Currency stays the workspace currency. User names, notes and project names are never translated. Unknown messages must not expose internal SQL or English-only library dumps in translated UIs.

Roles remain owner, manager, member, disabled. Members have personal overview, shared tasks/projects, their own time/report and account settings. Managers add team review, clients, budgets, cost rates, expenses and invoices. Owners also control roles and company billing identity. Visibility is convenience; database RLS enforces every financial read/write. Financial records never live as columns on member-readable projects or memberships.

## Finance model

Use separate authenticated manager-only tables, workspace-scoped composite foreign keys, bounded lists, typed schemas and the same user-scoped service for GUI and MCP. No service-role runtime. All tables have RLS and no anon access. Currency amounts are integer minor units; UI formatting respects currency precision. Rates are amount per hour. SQL/TypeScript calculations must agree in rounding. Workspace currency cannot be mixed with another in one invoice.

Clients store name, billing address, contact email, tax ID and preferred invoice language (en/de/zh). A company billing profile stores legal name/address, tax/VAT ID, payment details, invoice prefix and footer; owner writes, managers read. No fake legal identity or banking data is prefilled.

Effective-dated staff rates store workspace/user, employee/freelancer type, cost and bill rate; a salary helper derives an estimated hourly internal cost from annual total employer cost / annual productive hours. Planning lines can also represent an external freelancer before that person has an account. Never imply payroll calculation or treat unknown cost as zero.

Each project commercial plan chooses hourly, fixed-fee or internal; client and default bill rate; fixed contract amount; planned expense amount and editable estimate lines (phase/role, employee/freelancer, planned minutes, cost rate, bill rate). Show planned revenue/cost/contribution margin, actual tracked labor cost + actual external expenses, remaining hours and forecast total cost. Forecast uses actuals + estimated remaining work, never actuals plus the entire original labor estimate. Show the date range, missing rates and the fact that contribution excludes unconfigured overhead. All work hours incur cost, only billable hours accrue billable value. An expense must not also duplicate an already time-costed freelancer charge.

## Invoicing

Provide saved drafts with customer, project, invoice language, issue/due/service dates, description/quantity/unit price/tax rate lines, payment instructions and notes. Allow an explicit draft from approved, billable, not-yet-invoiced time, and manual fixed-fee installments. Drafts have no legal number and display Draft prominently. Managers review and explicitly finalize. Finalization is atomic and idempotent, allocates a unique workspace invoice number under lock, computes totals server-side and freezes issuer/customer/line/tax/currency/date snapshots. Issued invoices cannot be edited or deleted by ordinary authenticated roles, even through direct PostgREST. Keep a linked immutable full cancellation/correction document, with its own number and opposite totals; do not call this German self-billing Gutschrift. Record paid/unpaid status separately from the immutable financial document. Audit finalization/cancellation/payment actions. Approved time must not be claimed by two issued invoices; retries must not allocate additional numbers. Never allow manager-supplied totals or status fields to bypass the RPC.

Provide a safely escaped print view with Print / Save PDF, CSV export and stable IDs. The invoice's chosen language is independent of UI language and remains frozen. PDF is explicitly a PDF invoice, not XRechnung/ZUGFeRD. Show a short decision-relevant note before issue that structured electronic invoicing may be required; company/tax and delivery applicability require real operator configuration. No blanket legal-compliance claim. No automated customer mail send without configured delivery and deliberate user action.

## Optional first-run example workspace

Offer a clear empty-workspace versus researched-example choice before creation. Empty is the default. The optional VAVE demo creates a separate workspace with eight public portfolio projects/clients, eight studio references and six public leadership profiles, with direct official source links and research date. Public profiles are reference information, not user accounts, invitations, assigned salaries or application roles. All operational periods, hours, costs, budgets and invoice drafts are explicitly fictional, separate from historical portfolio years. Demo invoices can never be finalized (database-enforced); no legal identity, tax ID, bank data or contact email is invented. Seed atomically with an idempotency key. Archiving is restricted to the original creator who is still an owner, hides this demo through the normal authorization boundary and preserves underlying records; never delete unrelated workspaces or bypass existing time/audit protections. Provide the same option via MCP. Research record: `docs/research/vave-public-research.md`.

## Integrations delivery

Deliver genuine finance/time CSV export, task deadlines as an ICS snapshot and finance MCP tools. Explain current supported integrations in settings. Recommend an accounting connection (e.g. Lexware Office/sevdesk/Xero) to handle structured invoices and payment sync, and Google/Outlook calendar suggestions later; do not show fake connected buttons. Account-dependent providers cannot be silently provisioned. MCP descriptions and error replies default to English and support en/de/zh via an explicit language argument where appropriate; never translate arbitrary data or protocol/tool identifiers.

## Architecture and verification

`src/shared/i18n.ts`: pure locale resolution/catalog/translation. `src/web/i18n.tsx`: reactive provider, persistence, switcher. Existing UI and helpers use it. `src/shared/finance-types.ts`, `finance-validation.ts`, `finance-service.ts`, `finance-math.ts` isolate finance contracts and calculations. `src/web/finance/` owns new screens and print/export logic. `src/server/finance-mcp.ts` registers finance tools into existing server. Emails are generated in all three languages with safe Go-template branch selection from whitelisted `.Data.locale`; English fallback, no arbitrary metadata rendered.

Tests must prove locale fallback/override, translated role navigation, no member finance request, cross-workspace/disabled/anon denials, safe positive/negative rounding, missing cost warnings, immutable invoices, unique numbering and retry, duplicate time billing denial, snapshot retention after customer/rate edits, cancellation, zero-tax explanation and escaped invoice output/CSV. Existing 68 tests are the baseline. Run typecheck/build/unit+PostgreSQL tests locally and browser checks in GitHub CI; managed Sites environment has no supported local browser QA. Apply additive migrations only after tests/review, verify real DB transactionally, preserve private Site audience, update main and deploy.

## Research basis

Harvest: separate cost/bill rates and hour/fee budgets; Productive: manager-specific budgets/invoicing and explicit invoice finalization. BMF/UStG distinguish ordinary PDFs from structured e-invoices. This app implements operational controls, not an accounting compliance certification.

- https://support.getharvest.com/hc/en-us/articles/360048687391-Setting-and-editing-cost-rates
- https://support.getharvest.com/hc/en-us/articles/360048686811-How-to-set-project-budgets
- https://help.productive.io/en/articles/11048442-finalizing-and-sending-invoices
- https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
- https://www.gesetze-im-internet.de/ustg_1980/__14.html
