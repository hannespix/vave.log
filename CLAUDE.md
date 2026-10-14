# CLAUDE.md — Arbeitsweise vave.log

Vorgaben des Auftraggebers (14.10.2026):

- **PR-Merge und Deploy laufen immer automatisch.** Änderungen kommen als PR auf
  `main`; sind alle Checks („Verify VAVE.LOG“) grün, wird der PR **sofort selbst
  gemerged** (Squash, Titel wie die bisherigen `… (#n)`-Commits) — kein Warten
  auf eine Freigabe je PR. Nach dem Merge deployt `.github/workflows/pages.yml`
  die statische Web-App automatisch auf GitHub Pages, sobald der CI-Lauf auf
  `main` grün ist. Die private Sites-Bereitstellung (ChatGPT Sites) wird nicht
  von hier aus deployt.
- Nach dem Merge den Arbeitsbranch neu von `main` aufsetzen.
- Vor jedem Push lokal prüfen: `npm run check` (TypeScript, Unit-Tests, Build)
  und bei UI-Änderungen `npm run test:e2e`.
- `STATE.md` bei inhaltlichen Änderungen fortschreiben (deutsch); Commits und
  PR-Beschreibungen wie bisher.
- Nur öffentliche Konfiguration ins Repo (Supabase-URL, Publishable Key).
  Niemals Service-Role-/Secret-Schlüssel.
