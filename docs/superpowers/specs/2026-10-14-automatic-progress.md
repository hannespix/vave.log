# Automatic project progress

User steering added during the PWA release: project progress should calculate itself from available data and explain its KPIs, milestones and missing data in a clean detail view.

Completion measures the recorded task scope. If every task has a positive estimate, completed estimated minutes divided by all estimated minutes determines progress. Otherwise the fallback is explicitly unweighted completed tasks divided by all tasks. Tasks in progress are not arbitrarily half complete. No tasks means unknown, not zero. All tasks done means all tracked tasks complete, not proof of client acceptance or a historical delivery date.

Hours consumed, budget remaining, recent team pace and the constant-pace finish scenario remain distinct KPIs. They use the automatic progress denominator and the existing conservative work-history gates. Legacy manually reported percentages remain stored for compatibility, but do not drive primary progress or scenarios. Adding tasks or reopening work can lower the calculated percentage.

Milestones are designated tasks with the normal status and due date. They are shown separately as delivery checkpoints and are not counted twice. Task estimates and milestone designation are available in GUI and MCP under existing permissions. The manager analysis uses a full-scope, workspace-local security-invoker RPC; ordinary project cards derive the same percentage from their complete accessible task set.

The detail view exposes its method, task statuses, milestone timeline, planning KPIs, missing estimates, dates, owners, budget and forecast history. Corrective links open the relevant project context. Reopening/refocusing or explicitly refreshing re-reads the authoritative snapshot. EN/DE/ZH apply throughout; extra detail stays in the modal and disclosure panels.

Demo metadata fills missing estimates on proven seed records and provides meaningful milestone examples while preserving user changes. Existing task status, deadlines, financial records, budgets and time are retained. New demos include plausible weighted completion rather than independent manually entered percentages.

Verification covers formula edge cases and changes in scope/status, server validation/RLS and aggregate parity, seeded preservation/idempotence, localized accessible presentation, and desktop/mobile task-to-analysis browser workflows.
