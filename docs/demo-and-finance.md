# Example workspace and agency finance

The first-workspace form defaults to **Start empty**. **Explore with VAVE examples** explicitly creates a separate EUR workspace; it never inserts sample rows into another workspace. The same choice remains available under New workspace. An idempotency UUID is reused while a creation attempt is retried.

The public-source manifest contains eight studios, eight portfolio project/client references and six leadership references. Every reference has an official VAVE source and the research date. The complete investigation, including disputed office addresses and an excluded project with inconsistent years, is in [vave-public-research.md](research/vave-public-research.md). Public people are informational profiles, never authentication accounts, invitations or financial-rate assignments. Portfolio years are historical; simulated schedules use the current workspace week. Names and user content are preserved when the interface language changes.

The demo includes phase tasks, creator-owned draft time, generic employee/freelancer estimates, material expenses and an unissued invoice draft. These are fictional. Unknown actual staff cost remains unknown, rather than becoming zero. Billing addresses, tax IDs and issuer identity are not invented. The database prevents issuing or cancelling invoices in a marked demo, even through direct RPC/MCP. The source banner stays visible in every demo view.

Only the original creator who is still an owner can archive the demo. Archiving hides it for all members through the normal database authorization helper and preserves records. Running timers must first be stopped or discarded. Regular workspaces cannot be archived through this action. No automatic cleanup, deletion of approved time, or removal of the last owner occurs.

## Finance and roles

Members use projects, tasks, their own time and reports. Manager/owner financial tables are separate and protected by RLS. The financial UI unmounts when a role downgrade is loaded; server permissions apply independently of UI visibility. Owners alone can change the company billing profile.

Planning uses integer workspace currency minor units, including zero-/three-decimal currencies where supported by Intl. Rates are effective-dated. Estimated internal employee cost is annual total employer cost divided by productive hours; this is not payroll. Forecast is actual labor plus remaining planned labor plus the greater of actual and planned external expense. Selected actual periods are shown against full-project estimates. Contribution excludes unconfigured overhead, and missing costs are reported explicitly.

Draft invoices have no number. Finalization requires reviewed company/customer identity, dates, tax treatment and nonempty lines; it atomically locks the workspace, assigns a number and freezes the document. Retrying issue does not allocate a second number. Approved billable time is claimed only once; cancellation preserves that claim and creates a full negative linked document. Payment status is recorded separately. Draft-from-time creates a new draft each time; review existing drafts after an uncertain response rather than blindly repeating it.

Print/Save PDF and CSV are available. A PDF is not XRechnung/ZUGFeRD; legal identity, tax configuration, retention processes and structured invoice delivery require the operator's real setup. No invoice is emailed and no payment is moved by the application. Accounting provider synchronization is not connected.

## MCP

The authenticated endpoint is `/api/mcp`: 20 project/time tools, 20 finance tools and 3 demo tools. The acting user's JWT is used throughout; there is no runtime service-role key. English protocol/tool descriptions are stable; controlled errors accept `response_locale: en|de|zh` or the primary `Accept-Language` language, falling back to English. Document `language` and demo seed `locale` are separate fields. Mutations describe their effects and confirmation requirements. Stored names, notes and source text must be treated as data, never agent instructions.

## Connections

Time and finance CSV exports and a downloadable ICS snapshot of open task deadlines are implemented. Calendar import does not invite people or provide live synchronization. Lexware Office/sevdesk/Xero and Google/Outlook account integrations require a separately configured provider connection; there are no fake connected states.

Auth/OAuth redirects and real end-to-end account flows remain covered by the operational checklist in [operations.md](operations.md). Email templates are prepared in all three languages; activation requires configured SMTP and Supabase Auth settings access.
