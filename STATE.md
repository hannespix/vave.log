# VAVE.LOG — aktueller Arbeitsstand

13.10.2026. Repository: hannespix/vave.log. Private Site: https://vave-log.pixer.chatgpt.site.

## Anwendung
Deutsche GUI mit Anmeldung/Reset, Workspaces, Projekten, Aufgaben, Zeiterfassung/Timer, Freigaben, Berichten/CSV, Teamrollen, Einstellungen und OAuth-Zustimmung/Widerruf. Gemeinsamer validierter Service und 20 MCP-Werkzeuge; keine privilegierten Supabase-Schlüssel im Runtime-System. Das originale VAVE-Logo läuft in drei langsamen, variierenden Gesten ohne Wiedergabebutton. Reduzierte Bewegung wird berücksichtigt.

## Supabase ist eingerichtet
- Projekt `vave-log`, Referenz `ieeujtmpxqxmfyietqgw`, Organisation pix-el, Frankfurt; Status ACTIVE_HEALTHY.
- Migrationen `20261013202303_vave_log` und `20261013202642_secure_bootstrap_and_indexes` angewendet. Lokale Dateiversionen entsprechen der tatsächlichen Remote-Historie, damit GitHub/CLI sie nicht doppelt ausführen.
- Alle neun Anwendungstabellen verwenden RLS; anonyme Rollen besitzen keine Tabellenfreigaben. Interne Timerbelege sind auch für angemeldete Nutzer direkt gesperrt.
- Runtime-Konfiguration auf Sites gesetzt und erfolgreich deployt. `/healthz` liefert 200/configured; `/api/config` verweist auf das richtige Supabase-Projekt.
- Öffentlicher Auth-Check: E-Mail-Anmeldung aktiv, E-Mail-Bestätigung erforderlich, anonyme Konten deaktiviert.

## Verifiziert
- Lokal: TypeScript, Produktionsbuild, 68 Tests. PostgreSQL/RLS wird in PGlite tatsächlich ausgeführt; MCP mit dem offiziellen Client über HTTP geprüft.
- Bestehende GitHub-Browserprüfung: Desktop/Mobilgerät, Persistenz nach Reload und abgewiesenes Speichern. Neuer Regressionstest deckt den Wechsel vom Einrichtungszustand zur Anmeldung samt Dokument-CSP ab; CI-Status am aktuellen Commit beachten.
- Echtes Supabase-PostgreSQL: Mandantentrennung, Einladung, Zeitbuchung, Einreichen/Freigeben, Timerstopp/Wiederholung und Deaktivierung erfolgreich geprüft. `tests/live/supabase-smoke.sql` rollt alle synthetischen Konten und Daten zurück; anschließend null Testkonten und null Testworkspaces bestätigt.
- Anonyme echte PostgREST-Abfrage auf Workspaces liefert 401/permission denied. Keine Datenfreigabe als Fehlerbehebung nötig.
- Live-HTML liefert eine CSP mit expliziter Supabase-Domain. Beim Wechsel von einer bereits geöffneten unkonfigurierten Seite reicht API-Neuladen nicht: „Verbindung erneut prüfen“ lädt jetzt das gesamte Dokument einschließlich CSP neu.
- `/mcp` wird von Sites selbst reserviert. Die Anwendung verwendet deshalb `/api/mcp` samt passender OAuth-Ressourcenmetadaten.

## Advisor-Befunde
Der vom Supabase-Dashboard erzeugte `rls_auto_enable`-Eventtrigger war für API-Rollen ausführbar. EXECUTE wurde für public/anon/authenticated entzogen; der automatische RLS-Trigger bleibt aktiv. Fehlende Fremdschlüsselindizes sind ergänzt.

Verbleibende, geprüfte Hinweise:
- [SECURITY DEFINER für angemeldete Nutzer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): neun bewusst bereitgestellte RPCs benötigen dies für atomare, geschützte Workflows. Identität, Workspace-Rolle und zulässige Übergänge werden im Funktionskörper geprüft; anonymer Aufruf ist gesperrt. Diese Warnungen werden nicht als „keine Warnungen“ ausgegeben.
- [RLS ohne Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): private.timer_receipts verweigert absichtlich jeden direkten Clientzugriff. Zugriff nur durch geprüfte interne RPCs.
- [Unbenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): bei leerem Projekt erwartbar; keine Indizes allein deshalb entfernen.

## Noch offen bis zur Betriebsfreigabe
1. Supabase Auth > URL Configuration: Site URL und exakte Redirect URLs auf die veröffentlichte Site einstellen. Die verbundene Supabase-Schnittstelle bietet keine Auth-Konfigurationsänderung an; diesen Dashboard-Schritt muss der Besitzer vornehmen.
2. Echte Registrierung, Bestätigung, Login und Passwortreset mit dem Besitzer testen. Keine fremden Personen anschreiben oder Konten ohne Auftrag anlegen.
3. Supabase OAuth-Server/Clientregistrierung konfigurieren und echte MCP-Zustimmung/Widerruf testen. Die Existenz der Discovery-URL beweist keinen abgeschlossenen OAuth-Flow.
4. Aktuelle Site ist owner-private. Externe MCP-Clients und Teammitglieder benötigen bewusst eingerichteten Hosting-Zugang; keine automatische öffentliche Freigabe.
5. SMTP für Teamversand, Backup/Restore und Betriebsverantwortung einrichten. Mehrverbindungs-/Konkurrenztests bleiben von den Einverbindungs-SQL-Tests getrennt.

Die Anwendung ist mit dem Backend verbunden. Vollständiger Produktivbetrieb bleibt bis zu diesen Liveprüfungen unbestätigt. Details: docs/operations.md.

## Auth-E-Mails / Rückleitung (weiterer Stand 13.10.2026)
- 13 deutsche Supabase-HTML-Vorlagen in App-Farben, statischer VAVE.LOG-Wortmarke und ohne externe Medien vorbereitet. Quelle: `scripts/build-auth-emails.mjs`; erzeugte Vorlagen, Betreffe und reiner Template-PATCH unter `supabase/`; lokale Vorschau: `docs/email-preview.html`.
- Noch nicht in Supabase aktiviert. Für das neue Free-Projekt ist eigener SMTP erforderlich (Anbieteränderung 03.06.2026). Kein SMTP-Zugang und kein Auth-Management-Zugriff verfügbar; keine Testmails versendet.
- Gemeldetes `Cannot GET /?code=…` zusammen mit localhost:3000 weist auf die Supabase-Standardrückleitung hin. Site URL und Redirect-Allowlist im Dashboard noch durch Besitzer zu bestätigen. Die Chrome-DevTools-CSP-Meldung ist kein Anlass, die App-CSP zu lockern. Bereits erfolgte E-Mail-Bestätigung zuerst durch normalen Login prüfen.
- Anleitung mit exakten Werten und Aktivierungsschritten: `docs/auth-email-setup.md`. Branding ändert keine Freigaben, Anmeldeverfahren oder Benachrichtigungsschalter; Workspace-Einladungen bleiben ohne automatischen Mailversand.
