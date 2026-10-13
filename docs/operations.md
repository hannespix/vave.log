# Betrieb und Inbetriebnahme

## Voraussetzungen
- Node.js >=22.12 oder Docker, HTTPS vor dem Node-Server.
- Ein **eigenes** Supabase-Projekt für VAVE.LOG; keine Migration in eine fremde Anwendungsdatenbank.
- `APP_URL` ist der exakte HTTPS-Origin ohne Pfad. `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` sind öffentliche Konfiguration. Niemals Service-Role-/Secret-Schlüssel verwenden.
- Öffentliche Registrierung darf Konten erzeugen, aber verschafft keinen Zugriff auf bestehende Workspaces. Ein neuer Workspace ist strikt getrennt.

## Datenbank
Migrationen aus `supabase/migrations/` mit der Supabase CLI (`supabase link`, `supabase db push`) oder kontrolliert über das Dashboard anwenden. Vor jeder späteren Migration Datenbanksicherung und Test auf einer separaten Umgebung. Versionsverzeichnis vollständig aufbewahren. Der SQL-Code verlangt bestätigte E-Mail-Konten für das Anlegen von Workspaces und die Annahme von Einladungen.

## Auth
In Supabase Auth die Site URL auf `APP_URL` setzen, nur die exakten Callback-URLs für diese Installation freigeben. E-Mail-Bestätigung aktivieren, anonymen Login deaktivieren. Für reale Teamanmeldungen eigenen SMTP-Dienst einrichten; Standard-Mailversand ist begrenzt. Auth-Rate-Limits und Passwortschutz einschalten, sinnvolle Token-Laufzeit (z. B. 15 Minuten) konfigurieren. Selbstregistrierung nach Einrichtung bei Bedarf einschränken. Der erste verifiziert angemeldete Benutzer erstellt seinen Workspace und wird ausschließlich dort owner.

Einladungen sind als E-Mail-Zuordnung gespeichert, schicken aber bewusst keine Nachricht aus dieser Anwendung. Owner teilt den App-Link; der Empfänger meldet sich mit der bestätigten eingeladenen E-Mail an. `accept_invitations` fügt ihn dem Workspace hinzu. Rolle kommt aus der Einladung, nie aus Nutzermetadaten.

## MCP / OAuth
Supabase OAuth 2.1 Server ist laut aktueller Anbieter-Dokumentation **Beta**. In Auth > OAuth Server aktivieren, Authorization Path `/oauth/consent` setzen. Asymmetrischen JWT-Signierschlüssel (ES256/RS256) verwenden. Clients gezielt registrieren oder Dynamic Client Registration aktivieren. Keine Wildcard-Redirects. Nutzer müssen im Consent-Screen den konkreten Client und seine Rechte bestätigen. Standard-OIDC-Scopes beschränken Profilinformationen; Zugriff auf Anwendungsdaten folgt den angezeigten Workspace-Rollen/RLS-Regeln.

MCP-URL: `https://DEINE-DOMAIN/mcp`. Ein kompatibler Streamable-HTTP/OAuth-Client entdeckt die Autorisierung über `/.well-known/oauth-protected-resource/mcp`. KI-Nutzung setzt Unterstützung dieser Standards im jeweiligen Client voraus; nicht jedes Produkt unterstützt benutzerdefinierte MCP-Server.

Verbindungen lassen sich in der GUI widerrufen. Bereits ausgestellte JWTs können bis zum Ablauf gültig bleiben; keine sofortige Zugriffssperre behaupten. Rollenänderungen wirken für Datenbankzugriffe unmittelbar über die Membership-Tabelle. Betrieb erfordert einen vollständigen echten OAuth-Login-Test auf der endgültigen Domain.

## Ausführen
```
npm ci
npm run check
npm start
```
`npm start` liest lokale `.env`; Docker bekommt Variablen über die Plattform. `NODE_ENV=production` erzwingt HTTPS. Bei Entwicklung mit Vite auf Port 5173 `APP_URL=http://localhost:5173` setzen und beide Entwicklungsprozesse starten.

Node hinter einem kontrollierten Reverse Proxy betreiben. Host-Header erhalten. `TRUST_PROXY_HOPS` nur entsprechend der tatsächlichen festen Proxy-Kette setzen; Standard 0. Webserver/Plattform mit Request-Größenlimit, Timeouts und globalem Rate-Limit konfigurieren. Die Anwendung beschränkt MCP auf 64 KiB/Request und 120 authentifizierte Aufrufe/Minute je Prozess/Person. Vor der Auth-Prüfung gelten 180 Versuche/Minute je vertrauenswürdiger Client-IP sowie 1.000 Versuche/Minute je Instanz. Node verwendet die kontrollierte Proxy-Konfiguration; der Sites-Worker verwendet den von Cloudflare gesetzten CF-Connecting-IP-Header. Ohne sichere Client-IP teilen sich Anfragen ein restriktives Kontingent. Die Zähler gelten je Prozess/Worker-Isolate und ersetzen keinen globalen Schutz über mehrere Instanzen; auf der Plattform zusätzlich ein verteiltes Rate-Limit einrichten.

## Sites-Worker

`npm run build:worker` erzeugt `dist/server/index.js` mit lokal eingebetteten Assets. `.openai/hosting.json` bindet diese Installation an die vorhandene private Site. Zur Laufzeit `APP_URL`, `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` auf der Plattform setzen. Keine privilegierten Schlüssel. Der Standard-Origin dieser Installation ist https://vave-log.pixer.chatgpt.site; für andere Deployments `SITE_ORIGIN` beim Build oder `APP_URL` zur Laufzeit setzen. Die private Sites-Zugriffsschranke kann externe MCP-Clients blockieren: Für allgemeine KI-Clients ist ein bewusst öffentlich erreichbarer HTTPS-Origin mit App-/OAuth-Authentifizierung erforderlich. Die aktuelle private Bereitstellung verändert die Freigabe nicht automatisch.

## Daten und Grenzen
Arbeitszeiten sind Minuten und enthalten keine rechtliche Arbeitszeitprüfung. Timer rechnen vergangene Sekunden und teilen am Mitternachtspunkt der Workspace-Zeitzone; unter einer Minute bleibt der Timer zur Korrektur bestehen, über 24 Stunden wird nicht automatisch gebucht. Ein Stopprezept verhindert auch nach späteren Änderungen oder Löschen der Zeitzeile doppelte Buchungen. Tageslimit 1.440 Minuten je Person und Workspace-Datum. Zeiten über mehrere Workspaces werden nicht zu einer gesetzlichen Höchstarbeitszeit verrechnet. Keine Rechnungen, Steuer-/Lohnabrechnung oder verbindlichen Compliance-Aussagen.

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
6. Backup wiederherstellen; SMTP, HTTPS, Logs, Alarmierung und Zuständigkeit prüfen.

## Quellen
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://ts.sdk.modelcontextprotocol.io/server
