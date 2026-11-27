# Betrieb und Inbetriebnahme

## Voraussetzungen
- Node.js >=22.12 oder Docker, HTTPS vor dem Node-Server.
- Ein **eigenes** Supabase-Projekt für VAVE.LOG; keine Migration in eine fremde Anwendungsdatenbank.
- `APP_URL` ist der exakte HTTPS-Origin ohne Pfad. `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` sind öffentliche Konfiguration. Niemals Service-Role-/Secret-Schlüssel verwenden.
- Öffentliche Registrierung darf Konten erzeugen, aber verschafft keinen Zugriff auf bestehende Workspaces. Ein neuer Workspace ist strikt getrennt.

## Datenbank
Migrationen aus `supabase/migrations/` mit der Supabase CLI (`supabase link`, `supabase db push`) oder kontrolliert über das Dashboard anwenden. Vor jeder späteren Migration Datenbanksicherung und Test auf einer separaten Umgebung. Versionsverzeichnis vollständig aufbewahren. Beim Upgrade einer laufenden Instanz zuerst die neuen Lese-RPCs installieren, anschließend das passende Web-Build ausliefern und danach `20261127112202_activate_scoped_column_access.sql` anwenden. Die letzte Migration entzieht die bisherigen breiten Spaltenrechte. Der SQL-Code verlangt bestätigte E-Mail-Konten für das Anlegen von Workspaces und die Annahme von Einladungen.

## Auth
In Supabase Auth die Site URL auf `APP_URL` setzen, nur die exakten Callback-URLs für diese Installation freigeben. E-Mail-Bestätigung aktivieren, anonymen Login deaktivieren. Für reale Teamanmeldungen eigenen SMTP-Dienst einrichten; Standard-Mailversand ist begrenzt. Auth-Rate-Limits und Schutz vor kompromittierten Passwörtern einschalten, MFA für privilegierte Nutzer vorsehen und eine sinnvolle Token-Laufzeit (z. B. 15 Minuten) konfigurieren. Selbstregistrierung nach Einrichtung bei Bedarf einschränken. Der erste verifiziert angemeldete Benutzer erstellt seinen Workspace und wird ausschließlich dort owner.

Die konkreten Produktions-Redirects, Hilfe bei `Cannot GET` auf localhost und alle 13 gebrandeten Auth-E-Mails stehen in [Auth-E-Mail-Einrichtung](auth-email-setup.md). Neue Free-Projekte benötigen seit 3. Juni 2026 einen eigenen SMTP-Dienst, um Vorlagen anpassen zu können. Die Dateien im Repository sind vorbereitet; GitHub/Sites aktiviert sie nicht automatisch in Supabase.

Einladungen sind als E-Mail-Zuordnung gespeichert, schicken aber bewusst keine Nachricht aus dieser Anwendung. Owner teilt den App-Link; der Empfänger meldet sich mit der bestätigten eingeladenen E-Mail an. `accept_invitations` fügt ihn dem Workspace hinzu. Rolle kommt aus der Einladung, nie aus Nutzermetadaten.

## MCP / OAuth
In **Auth → OAuth Server** OAuth 2.1 aktivieren und den Authorization Path `/oauth/consent` einstellen. Einen asymmetrischen JWT-Signierschlüssel einsetzen. Einen bestimmten OAuth-Client mit dessen exakter Callback-URL registrieren.

Ein Workspace-Owner öffnet **Einstellungen → MCP-Freigaben** und trägt die registrierte Client-ID ein. Standard einer neuen Freigabe ist Lesen. Mit der ausdrücklichen Option **Zeitvorschläge erlauben** kann der Benutzer über MCP auch persönliche Vorschläge einreichen und anschließend in der Web-App prüfen. Bestehende OAuth-Verbindungen brauchen diese neue Workspace-Freigabe. Der Benutzer bestätigt die Verbindung zusätzlich über OAuth. Der Server behandelt die vom Workspace zurückgegebenen Namen und Titel als untrusted data.

Der MCP-Endpunkt des Node-/Worker-Hosts ist `https://DEINE-DOMAIN/api/mcp`. Streamable HTTP unterstützt OAuth-Discovery über `/.well-known/oauth-protected-resource/api/mcp`. GitHub Pages liefert die Web-App aus. Für MCP muss der erreichbare Node-/Worker-Host des Betreibers verwendet werden. Die Zulassung zum Workspace erfordert den freigegebenen Client, eine gültige Zustimmung und eine aktive Mitgliedschaft. Die Probe muss sowohl reguläre Browser-Sitzungen als auch OAuth-Tokens verwenden.

Der Connector kann Workspaces, Projekte, Aufgaben, eigene Zeiten und eigene Abwesenheiten mit begrenzten Feldern lesen. Verbindliche Buchungen, Rechnungen, Rollen und Löschungen werden in der Web-App ausgeführt. Der Widerruf in **Verbundene Apps** und das Entfernen der Workspace-Freigabe wirken bei der nächsten Datenbankabfrage. Mit `MCP_DISABLED=true` kann der Betreiber den HTTP-MCP-Endpunkt pausieren. Für einen projektweiten Stopp inklusive der Data API setze als Projektadministrator `private.vave_mcp_control.enabled` auf `false`. Die HTTP-Quoten gelten am Node-/Worker-Host. Die Datenbank prüft auch direkte Anfragen an die eng begrenzten MCP-RPCs. Den PostgREST Pre-Request-Hook `public.vave_request_gate` mit den Migrationen installieren und beim Freigabetest prüfen. Das Supabase-Projekt ist für VAVE.LOG vorgesehen, da der Hook die API-Grenze setzt.

## Ausführen
```
npm ci
npm run check
npm start
```
`npm start` liest lokale `.env`; Docker bekommt Variablen über die Plattform. `NODE_ENV=production` erzwingt HTTPS. Bei Entwicklung mit Vite auf Port 5173 `APP_URL=http://localhost:5173` setzen und beide Entwicklungsprozesse starten.

Node hinter einem kontrollierten Reverse Proxy betreiben. Host-Header beibehalten und `TRUST_PROXY_HOPS` entsprechend der tatsächlich vertrauenswürdigen Proxy-Kette setzen. Der Server begrenzt Eingaben auf 64 KiB, Antworten auf 256 KiB und MCP-Aufrufe auf zehn Sekunden. Er begrenzt parallele Anfragen pro Prozess und pro Benutzer-Client-Kombination. Vor der Auth-Prüfung und je Client gelten zusätzliche Quoten. Für mehrere Instanzen ein gemeinsames Rate-Limit am Proxy ergänzen. Das Protokoll enthält redigierte Ereignisse mit Request-ID, Client-ID und Werkzeugnamen.

## Sites-Worker

`npm run build:worker` erzeugt `dist/server/index.js` mit lokal eingebetteten Assets. `.openai/hosting.json` bindet diese Installation an die vorhandene private Site. Zur Laufzeit `APP_URL`, `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` auf der Plattform setzen. Keine privilegierten Schlüssel. Den Origin mit `SITE_ORIGIN` beim Build oder `APP_URL` zur Laufzeit setzen; der Standardwert steht in `scripts/build-worker.mjs`. Die private Sites-Zugriffsschranke kann externe MCP-Clients blockieren: Für allgemeine KI-Clients ist ein bewusst öffentlich erreichbarer HTTPS-Origin mit App-/OAuth-Authentifizierung erforderlich. Die aktuelle private Bereitstellung verändert die Freigabe nicht automatisch.

## Daten und Grenzen
Arbeitszeiten sind Minuten und enthalten keine rechtliche Arbeitszeitprüfung. Timer rechnen vergangene Sekunden und teilen am Mitternachtspunkt der Workspace-Zeitzone; unter einer Minute bleibt der Timer zur Korrektur bestehen, über 24 Stunden wird nicht automatisch gebucht. Ein Stopprezept verhindert auch nach späteren Änderungen oder Löschen der Zeitzeile doppelte Buchungen. Tageslimit 1.440 Minuten je Person und Workspace-Datum. Zeiten über mehrere Workspaces werden nicht zu einer gesetzlichen Höchstarbeitszeit verrechnet.

Manager und Owner können Kunden, Kosten, Stundenbudgets und Rechnungen verwalten. Ausgestellte Rechnungen behalten unveränderliche Aussteller-/Kunden-/Positionsdaten und eine atomar vergebene Nummer; Korrekturen erfolgen als verknüpftes Stornodokument. PDF entsteht über die Druckfunktion des Browsers. Es gibt keinen automatischen Rechnungsversand, Zahlungsabgleich, E-Rechnungs-/Buchhaltungsanschluss oder Steuer-/Lohnabrechnung. Die Anwendung trifft keine verbindlichen Compliance-Aussagen. Steuerbehandlung und Unternehmensangaben müssen vor echten Rechnungen geprüft werden.

Beim Anlegen eines Workspace ist eine leere Datenbasis voreingestellt. Die optionalen VAVE-Beispieldaten verwenden öffentliche Studio-/Projekt-/Führungsreferenzen mit Quellen; operative Zeiten und Finanzwerte sind ausdrücklich fiktiv. Öffentliche Namen und erfundene Personen werden als gekennzeichnete Demo-Teamprofile ohne Auth-Konto oder Einladung angelegt. Demo-Rechnungen können zum Erkunden ausgestellt und storniert werden; die Datenbank erzwingt dauerhaft DEMO-Markierung, DEMO-Nummern und Hinweise, dass keine Zahlung fällig ist. Der ursprüngliche Ersteller kann als Owner seinen markierten Demo-Workspace archivieren; echte Workspaces werden dadurch nicht verändert. Details und Quellen: [Demo und Finanzen](demo-and-finance.md), [Recherche](research/vave-public-research.md).

Einzelne Datenlisten sind auf 1.000 Datensätze begrenzt. Überlauf wird ausdrücklich angezeigt, nicht unbemerkt abgeschnitten. Auswertungen nennen ihren Zeitraum; sie sind keine unbegrenzten historischen Projektkosten. Finanzwerte werden nicht über Währungen hinweg summiert.

## Betriebskontrolle und Backups
`/healthz` prüft, ob Konfiguration vorhanden ist; es bestätigt nicht Erreichbarkeit/Migrationsstand der Datenbank. Separat einen authentifizierten Read-Smoke-Test einrichten. Keine Tokens/Passwörter/Notiztexte loggen. Auth- und Plattformfehler überwachen, Audit-Events nach internem Aufbewahrungskonzept speichern.

Vor Echtbetrieb Restore-Test aus einer Sicherung in separatem Supabase-Projekt durchführen. Backup/PITR hängen vom gewählten Supabase-Plan ab; Free nicht als garantierte Sicherung betrachten. Regelmäßigen sicheren Datenbankexport oder geeigneten Plan einrichten, getrennte Aufbewahrung und Löschfristen festlegen. CSV ist kein vollständiges Datenbankbackup.

## Freigabecheck
1. Migration in eigener Datenbank anwenden; Security Advisors ohne ungeklärten kritischen Befund.
2. Zwei bestätigte Testkonten in zwei Workspaces: gegenseitig keine Daten les-/änderbar.
3. Owner lädt Mitglied ein; Mitglied bucht, reicht ein; Leitung gibt frei; Bearbeitung danach gesperrt.
4. Timer in zwei Tabs starten/stoppen; nur eine Buchung, Datum/Zeitzone korrekt.
5. Echte GUI-Anmeldung, Passwortreset, OAuth-Zustimmung/-Ablehnung und Widerruf testen.
6. Finanz-/Demo-Transaktionen mit `tests/live/agency-smoke.sql` prüfen (sämtliche synthetischen Daten werden zurückgerollt); Konkurrenzfälle zusätzlich mit mehreren Verbindungen testen.
7. Backup wiederherstellen; SMTP, HTTPS, Logs, Alarmierung und Zuständigkeit prüfen.
8. Das Docker-Image für die Zielarchitektur bauen und mit aktueller
   [Grype-Datenbank](https://github.com/anchore/grype) auf App- und OS-Pakete prüfen.
   `docker build --pull -t vave-log:release .` baut das Release-Image.
   `grype docker:vave-log:release --fail-on high` prüft es auf hohe und kritische
   Befunde. Beim Aktualisieren des Basis-Digests die festgelegten Alpine-Pakete und
   ihre Sicherheitskorrekturen erneut prüfen.

## Quellen
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://ts.sdk.modelcontextprotocol.io/server
