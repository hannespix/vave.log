# Full demo implementation plan

Spec: ../specs/2026-10-14-full-demo-experience.md. User authorized autonomous execution/main/publish.

Use independent file-owned agents under dispatching-parallel-agents. Root integrates shared contracts, web/MCP tests, docs, live verification and release.

- Research: official public people credits and fictional scenario suggestions; no mutation.
- Backend owns new CLI-generated additive migration, src/shared/{types,finance-types,demo-data,demo-service}.ts and demo database/service tests. Implement conditional membership identity, robust sample invoice marking, rich atomic/idempotent seed and upgrade. Do not edit already-applied migration files or deploy.
- UI owns src/web/Logo.tsx, logo CSS declarations only, src/web/agency.tsx, src/web/workspace.tsx, finance UI/document/catalog files and finance output tests. Implement demo banner/upgrade, team examples, demo finance actions/marking and logo separator. All copy en/de/zh. No DB edits, no pretending external providers connected.
- Root updates MCP upgrade tool/descriptors, regression/browser fixtures, provenance/operation docs and runs combined checks.
- Independent review on combined code, real rollback SQL, migrations/advisors, matching remote migration filename, CI, main merge and owner-private Sites deployment.
