# VAVE.LOG

Projekte, Aufgaben, Arbeitszeiten und Agenturfinanzen für VAVE — per Oberfläche oder KI über MCP.

React/TypeScript, Supabase Postgres/Auth mit Row Level Security, gemeinsam genutzte Datenzugriffe und ein authentifizierter MCP-Server. Keine Service-Role-Schlüssel im laufenden System. Originales animiertes VAVE-Logo und lokale Readex-Pro-Schrift.

## Funktionen

- Getrennte Workspaces mit Owner-, Manager- und Mitgliedsrollen; sichere Deaktivierung ohne Verlust historischer Buchungen.
- Projekte mit Budget, Aufgaben und Zuständigkeiten, manuelle Zeiterfassung und Timer mit Mitternachtsaufteilung.
- Zeiten einreichen, freigeben und auswerten; CSV-Export mit Schutz gegen Tabellenformeln.
- E-Mail-Anmeldung, Passwortreset, OAuth-Zustimmung und Widerruf von KI-Verbindungen.
- 45 MCP-Werkzeuge über Streamable HTTP; dieselben Berechtigungen und Validierungen wie in der GUI.
- English, Deutsch und 简体中文: automatische Erkennung der ersten Systemsprache, Englisch als Fallback und dauerhafter Sprachwechsel. Datums-/Zahlenformate, Exporte und vorbereitete Auth-E-Mails folgen der Sprache.
- Manager/Owner: Kunden, Kosten- und Verrechnungssätze, Angestellten-/Freelancerplanung, Ausgaben und Projektprognosen; Owner pflegen die rechtliche Rechnungsidentität.
- Rechnungsentwürfe aus Positionen oder freigegebenen Zeiten, atomare Nummerierung und unveränderliche Snapshots, verknüpfte Stornorechnung, Zahlungsstatus und PDF-/CSV-Ausgabe. Keine automatische Mailzustellung, keine strukturierte E-Rechnung.
- Beim Einstieg wahlweise leerer Workspace oder eine recherchierte VAVE-Demo: acht Projekte/Kunden, acht Studios und sechs öffentliche Personenprofile. Alle operativen Zahlen sind fiktiv, Rechnungsfreigabe gesperrt. Quellen und Unsicherheiten: [Recherche](docs/research/vave-public-research.md).
- Aufgabenfristen als ICS-Snapshot für Kalender; responsive Ansichten und lokale Markenanimation.

## Betrieb

Node.js >=22.12. `npm ci`, `.env.example` nach `.env` kopieren und die drei öffentlichen Einstellungen setzen. Migration aus `supabase/migrations/` in einem eigenen Supabase-Projekt anwenden. Anschließend `npm run build && npm start`.

Die vollständige Anleitung zu Auth, OAuth, SMTP, Backups, Docker und Freigabetests steht in [docs/operations.md](docs/operations.md). Für Entwicklung `npm run dev:server` und `npm run dev` in getrennten Terminals verwenden.

## Prüfung

`npm run check` führt TypeScript, Unit-/Integrationstests und Produktionsbuild aus. PostgreSQL/RLS wird mit PGlite tatsächlich ausgeführt; MCP wird mit dem offiziellen Client über HTTP getestet. `npm run test:e2e` prüft die GUI mit Playwright auf Desktop und Mobilgerät gegen kontrollierte API-Antworten. Diese Tests ersetzen keinen vollständigen Live-Test mit Supabase/OAuth. GitHub Actions führt beide Prüfungen aus.

`npm run build:worker` erzeugt zusätzlich den Worker für die private Sites-Bereitstellung; Node und Worker verwenden denselben MCP-/HTTP-Kern. Die Supabase-Konfiguration wird zur Laufzeit geladen, nicht in den Browser-Build eingebrannt.

## Bereitstellungsstand

Privater Bereitstellungsort: https://vave-log.pixer.chatgpt.site

Das eigene Supabase-Projekt ist eingerichtet und verbunden; Datenbank-Zugriffsregeln und Kernworkflows wurden dort geprüft. Für die Betriebsfreigabe fehlen noch die Auth-Weiterleitungen im Dashboard sowie echte Registrierungs-/OAuth-Tests. Ohne Konfiguration zeigt die Anwendung weiterhin ausdrücklich den Einrichtungszustand. Konkrete Nachweise und verbleibende Schritte stehen in [STATE.md](STATE.md).
