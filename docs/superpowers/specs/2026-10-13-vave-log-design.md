# vave.log — produktive Grundlage

Hannes beauftragt am 13.10.2026 die eigenständige Weiterentwicklung mit Supabase, GUI und MCP. Zielrepo ist ausdrücklich hannespix/vave.log (zu Beginn leer). Tobias hat keine Umfragedaten geliefert; Produktentscheidungen sind Annahmen von Hannes' delegiertem Entwicklungsauftrag, keine bestätigten Kundenanforderungen. Die eingefrorene Umfrage in vave-discovery bleibt unangetastet.

## Entscheidung
Ein fokussiertes Teamwerkzeug für Projekte, Aufgaben und Arbeitszeiten. Kein Buchhaltungs-ERP. Eine durchgängige Implementierung ersetzt den lokalen Demo-Datenspeicher. React/Vite/TypeScript, Supabase Postgres + Auth und ein Node/Express HTTP-Server für statische Dateien, Laufzeitkonfiguration und MCP Streamable HTTP. Gemeinsame Services in src/shared/service.ts bedienen GUI und MCP. Kein Service-Role-Key im Laufzeitbetrieb.

## Funktionen
Anmelden/Registrieren mit bestätigter E-Mail, Passwort zurücksetzen, Workspace anlegen, bestehende E-Mail-Adressen zum Workspace einladen (Einladung wird nach verifiziertem Login angenommen; kein automatischer Mailversand der Anwendung), Rollen owner/manager/member, Workspace-Wechsel. Projekte mit Kunden, Status, Minutenbudget; Aufgaben mit Status, Zuordnung, Fälligkeit. Eigene Zeiten manuell erfassen, ändern/löschen solange draft, Timer starten/stoppen/verwerfen, ein Timer pro Person. Einreichen und durch Leitung freigeben/zurückweisen. Wochenübersicht, gefilterter CSV-Export, Budgetverbrauch, Teamübersicht. Deutsche UI, international taugliche IANA-Zeitzonen und ISO-Datumswerte.

## Sicherheit und Konsistenz
RLS auf allen öffentlichen Tabellen. Mitglieder sehen Projekte/Aufgaben ihres Workspace und eigene Zeiten; owner/manager dürfen Teamzeiten sehen und Freigaben bearbeiten. Kein Nutzer darf sich selbst in fremde Workspaces eintragen oder Rollen erhöhen. Rollenwechsel/Einladungen nur owner; manager verwaltet Projekte. Workspace- und Projektzugehörigkeit per Composite-FK, nicht nur UI. Kritische Zeitübergänge per SQL-RPC, idempotenter Timerstopp, Tageslimit 1440 Minuten, Audit-Log ohne Passwörter/Tokens. Alle Identitäten aus verifizierten Supabase-Tokens. MCP validiert origin, host, Bearer, issuer/audience/role und beschränkt Ressourcen; keine generische SQL-Schnittstelle. OAuth2.1 von Supabase (Beta) mit eigenem Consent-/Revocation-UI. Approval durch Mensch wird über explizite Tool-Beschreibungen verlangt; Tools sind keine willkürliche Codeausführung.

## UX
VAVE Schwarz/Weiß, Violett #641dff, Limette #e8ffb9; Readex Pro lokal. Original-Lottie von https://www.vave.studio/wp-content/uploads/2024/12/VAVE_Logo_Animation.json, Quellnachweis im Repository. Animation respektiert reduced motion und ist pausierbar. Mobile 390px, Tastatur und sichtbarer Fokus, Lade-/Leer-/Fehlerzustände, kein vorgetäuschter Speichererfolg. Konfigurationsloser Start zeigt Einrichtungsseite; explizite Demo ist nur im Entwicklungsmodus erlaubt. Keine fingierten Live-Daten.

## Nachweise / Auslieferung
Versionierte Migrationen, ausführbare Datenbanktests mit echtem PostgreSQL (PGlite für lokale CI), API-/MCP-Tests, UI-Browsertests, Typecheck, Produktionsbuild und Dependency-Audit. Dockerfile, CI und Betriebsanleitung einschließlich Backup/Restore, OAuth, SMTP, HTTPS, Migrationen, Smoke-Test und Grenzen. Code wird in vave.log gespeichert. Produktivbetrieb wird erst behauptet, wenn echte Supabase-Konfiguration und Live-Authentifizierung geprüft sind; fehlende Zugänge werden präzise benannt.
