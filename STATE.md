# VAVE.LOG — aktueller Arbeitsstand

13.10.2026. Auftrag: eigenständig arbeitsfertig entwickeln, Supabase + GUI + MCP, main sichern und deployen. Zielrepository hannespix/vave.log. Die bisherige Umfrage in vave-discovery bleibt als Referenz erhalten.

## Implementiert
- Vollständige deutsche GUI: Anmeldung/Reset, Workspace-Erstellung, Übersicht, Projekte, Aufgaben, Zeiterfassung/Timer, Freigaben, Berichte/CSV, Team, Einstellungen, OAuth-Zustimmung/Widerruf.
- Supabase-Migration mit Mandantentrennung/RLS, zusammengesetzten Fremdschlüsseln, geschützten Statusübergängen, Audit und atomarem Timerstopp mit wiederholbarer Rückgabe.
- Einladungen für bestätigte E-Mail-Konten und sichere Deaktivierung von Mitgliedern; keine Nachrichten werden automatisch versendet.
- Gemeinsamer validierter Service, 20 MCP-Werkzeuge, offizieller HTTP-Transport, OAuth-Metadaten, JWT-/Host-/Origin-Prüfung.
- Originales VAVE-Lottie-Logo lokal, lokale Schrift; Node/Docker und Sites-Worker, GitHub-CI mit Playwright.

## Nachweise und Grenzen
- TypeScript, vollständiger Produktionsbuild, PostgreSQL/RLS-, Service-, HTTP-, MCP- und Frontend-Helfertests lokal geprüft.
- Unabhängige Sicherheitsprüfung durchgeführt. Nachgewiesene Funde zu Datumswerten, Einladungsrollen, Timerwiederholung und Worker-Rate-Limits behoben und mit Regressionstests abgesichert.
- Aktueller npm-Audit der Laufzeitabhängigkeiten: keine bekannten Sicherheitslücken.
- PostgreSQL-Tests laufen in einer PGlite-Verbindung; sie beweisen keine konkurrierenden Transaktionen über mehrere echte Verbindungen.
- Playwright prüft Desktop/Mobilgerät mit kontrollierten API-Antworten in GitHub Actions. Der endgültige CI-Status ist am Commit auf GitHub maßgeblich.
- Echte Supabase-Auth-/OAuth-, PostgREST- und Browser-End-to-End-Tests gegen die Produktionsdatenbank stehen noch aus.
- Initiales JavaScript ist größer als Vites Standardwarnschwelle; der Workspace wird separat geladen. Keine nicht gemessene Performance-Zusage.

## Externer Blocker
Supabase ist verbunden. In der Organisation pix-el bestehen ausschließlich andere Anwendungen; keine davon wurde verändert. Für VAVE.LOG fehlt ein eigenes Projekt.

Die angebotene Supabase-Funktion `get_cost`, Voraussetzung für die Projektanlage, antwortete mit `MCP tool get_cost was not returned by tools/list` (UNAVAILABLE). Damit kann die erforderliche Projektanlage über die verfügbare Verbindung nicht abgeschlossen werden. Das ist ein technischer Verbindungsblocker, keine ausstehende Produktentscheidung.

Nächster notwendiger Schritt: ein eigenes Supabase-Projekt `vave-log` in pix-el / Frankfurt bereitstellen. Danach Migration anwenden, veröffentlichbare Konfiguration setzen, Auth/OAuth/SMTP einrichten, Security Advisors und echte Workflows prüfen. Keine Service-Role- oder Datenbankpasswörter in Repository oder Chat eintragen.

## Deployment
Ziel ist die owner-private Site https://vave-log.pixer.chatgpt.site. Ohne Supabase bleibt sie absichtlich im Einrichtungszustand; `/healthz` liefert dann 503. Ein erfolgreicher Quellcode-/Site-Deploy ist noch kein betriebsbereiter Backend-Status.
