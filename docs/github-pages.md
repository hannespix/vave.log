# GitHub Pages: statische Bereitstellung

Neben der privaten Sites-Bereitstellung kann die Web-App als rein statische Seite
auf GitHub Pages laufen. Der Workflow `.github/workflows/pages.yml` deployt
automatisch **nach jedem Merge auf `main`, sobald der CI-Lauf „Verify VAVE.LOG“
grün ist** (zusätzlich manuell über *Run workflow*).

## Was auf Pages läuft — und was nicht

- Die komplette Browser-App (Workspaces, Zeiten, Aufgaben, Finanzen, PWA) spricht
  direkt mit Supabase; ein eigener Server ist dafür nicht nötig.
- `/api/config` wird beim Build als statische Datei erzeugt (nur öffentliche
  Konfiguration: Supabase-URL, Publishable Key, App-URL). Das weicht bewusst von
  der Server-Bereitstellung ab, die die Konfiguration zur Laufzeit liefert.
- **Nicht enthalten:** der MCP-Endpoint `/api/mcp` (KI-Clients brauchen weiter die
  Node-/Worker-Bereitstellung), `/healthz` sowie serverseitige Security-Header —
  die Content-Security-Policy steckt stattdessen als `<meta>`-Tag im Dokument.
- Service Worker, Manifest und Offline-Seite werden auf den Pages-Basispfad
  (`/vave.log/`) umgeschrieben; die PWA bleibt installierbar.

## Einmalige Einrichtung

1. **Pages aktivieren:** Settings → Pages → Source „GitHub Actions“
   (der Workflow versucht das über `configure-pages` selbst; schlägt das fehl,
   einmal manuell umstellen). Für private Repositories setzt GitHub Pages einen
   bezahlten Plan voraus.
2. **Repo-Variablen** (Settings → Secrets and variables → Actions → *Variables*,
   keine Secrets — beide Werte sind öffentliche Client-Konfiguration):
   - `SUPABASE_URL` – z. B. `https://ieeujtmpxqxmfyietqgw.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` – der `sb_publishable_…`-Schlüssel
   Ohne diese Variablen deployt die Seite im ehrlichen Einrichtungszustand.
3. **Supabase Auth → URL Configuration:** die Pages-URL
   (`https://<owner>.github.io/<repo>/`) als zusätzliche Redirect-URL eintragen,
   sonst landen Bestätigungs-/Reset-Links nicht in der App
   (siehe `docs/auth-email-setup.md`).

## Bewusste Einschränkungen

- **Eine GitHub-Pages-Seite ist öffentlich erreichbar** (auch bei privatem
  Repository). Die bisherige Entscheidung „Hosting bleibt owner-private“
  (STATE.md) gilt damit für diese Bereitstellung nicht. Die Daten selbst bleiben
  durch Supabase Auth + RLS geschützt; öffentlich ist nur die Anwendung samt
  Publishable Key (der dafür gedacht ist).
- Deep-Links funktionieren über das Hash-Routing (`/#w=…`); `404.html` liefert
  als Kopie von `index.html` auch direkte Aufrufe aus.
- Lokal testen: `PAGES_BASE=/vave.log/ APP_URL=https://example.test/ npm run build:pages`
  und `dist/pages/` mit einem statischen Server unter dem Basispfad ausliefern.
