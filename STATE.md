# VAVE.LOG — aktueller Arbeitsstand

13.10.2026. Repository: hannespix/vave.log. Private Site: https://vave-log.pixer.chatgpt.site.

## Anwendung

GUI in Englisch, Deutsch und vereinfachtem Chinesisch: erste Systemsprache de/zh, sonst Englisch; sichtbarer Sprachumschalter mit gespeicherter Auswahl. Anmeldung/Reset, Workspaces, Projekte, Aufgaben, Zeiterfassung/Timer, Freigaben, Berichte/CSV, Teamrollen und OAuth-Zustimmung/Widerruf. Das originale VAVE-Logo läuft in drei langsamen, variierenden Gesten ohne Wiedergabebutton; reduzierte Bewegung wird berücksichtigt. Ein einziger farbiger Punkt trennt VAVE und LOG. Der Sprachumschalter zeigt nur Globus und Sprachkürzel.

Manager/Owner erhalten Kunden, Kosten-/Verrechnungssätze, Mitarbeiter-/Freelancerplanung, Stundenbudgets, Ausgaben, Prognosen und Rechnungen. Entwürfe aus freigegebener Zeit oder manuellen Positionen; ausdrückliches Ausstellen mit atomarer Nummer und unveränderlichen Daten; verknüpftes Storno und separater Zahlungsstatus. Druck/PDF über Browser, CSV und Kalender-ICS-Export. Keine automatische Buchhaltungsanbindung, Zahlung oder E-Mail-Versendung.

Erster Start bietet leeren Workspace (voreingestellt) oder recherchierte VAVE-Beispieldaten: acht öffentliche Studioreferenzen, 49 öffentlich genannte Personen plus acht erfundene Teamprofile, acht öffentliche und fünf erfundene Projekte. Aufgaben, Arbeitszeiten, Kostensätze, Budgets, Ausgaben sowie offene, bezahlte und stornierte Beispielrechnungen füllen die echten Ansichten. Operative Angaben sind fiktiv. Beispielpersonen haben keine Auth-Konten oder Zugangsdaten. Demo-Rechnungen können über die regulären Abläufe ausprobiert werden; Datenbank und Exporte erhalten dauerhaft DEMO-/Nicht-bezahlen-Markierungen. Bestehende Demos bieten „Demo vervollständigen“; Quellen bleiben in der Entwicklungsdokumentation. Ersteller/Owner kann ausschließlich seinen markierten Demo-Workspace archivieren.

44 MCP-Werkzeuge verwenden dieselben validierten Services und Nutzerrechte wie die GUI; keine privilegierten Supabase-Schlüssel im Runtime-System. Endpoint `/api/mcp` (Sites reserviert `/mcp`).

## Supabase

Projekt `vave-log`, Referenz `ieeujtmpxqxmfyietqgw`, Frankfurt. Angewandte Migrationen; lokale Dateiversionen entsprechen der Remote-Historie:

- `20261013202303_vave_log`
- `20261013202642_secure_bootstrap_and_indexes`
- `20261013220039_agency_finance`
- `20261013220054_researched_demo_workspace`
- `20261013220233_finance_foreign_key_indexes`

Öffentliche Tabellen sind RLS-geschützt. Finanzdaten liegen in separaten Tabellen mit Manager-/Owner-Prüfung; Unternehmensidentität kann nur der Owner ändern. Anonyme Tabellenzugriffe sind gesperrt. Nummernzähler und Timerbelege sind auch für angemeldete Nutzer direkt gesperrt.

## Verifiziert

- Unabhängige Code-/Sicherheitsprüfung ohne Release-Blocker. Übersetzung für leere Zeitnotizen in Rechnungsentwürfen korrigiert und mit realem SQL-Regressionstest geprüft.
- GitHub CI am Stand `a6b72fbe34f4f152ca83de8cdb57a711bb23dcb4`: 154 Tests, TypeScript, Produktionsbuild, 22 Desktop-/Mobil-Browserprüfungen, Abhängigkeitsaudit ohne bekannte Sicherheitslücken. Abschließender lokaler Durchlauf nach Übersetzungskorrektur und Indexmigration: 155 Tests, TypeScript und Produktionsbuild erfolgreich. Finalen CI-Status am Release-Commit beachten.
- Neues Live-SQL-Skript `tests/live/agency-smoke.sql` auf echtem Supabase PostgreSQL: neun erwartete Zugriffsverweigerungen, Ausstellung/Wiederholung, unveränderliche Daten, Storno, Zahlungsstatus, drei Audit-Aktionen sowie Demo-Erstellung/Archivierung erfolgreich. Alle synthetischen Daten durch ROLLBACK entfernt. Vorher/nachher unverändert: zwei Konten, zwei Workspaces, zwei Zeitbuchungen, null synthetische Konten.
- Bestehender Live-SQL-Test deckt Einladung, Zeitbuchung, Einreichen/Freigeben, Timerstopp/Wiederholung und Deaktivierung ab. Anonyme PostgREST-Abfrage verweigert Datenzugriff.
- CSP erlaubt die konkrete Supabase-Domain; erneute Verbindungsprüfung lädt das Dokument mit der aktuellen Policy vollständig neu.
- Tests sind keine Mehrverbindungs-/Lastprüfung. Tatsächlicher Browser-PDF-Druck und E-Mail-Zustellung sind noch nicht im Livebetrieb verifiziert.

## Advisor-Befunde

Zwei fehlende Finanz-Fremdschlüsselindizes wurden nach dem Live-Advisor ergänzt. Weitere verbleibende Hinweise:

- [Authentifizierte SECURITY-DEFINER-RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): neun bestehende, bewusst bereitgestellte RPCs prüfen Identität, Workspace-Rolle und Übergänge. Neue Finanz-/Demo-Endpunkte sind öffentliche Invoker mit geschützten privaten Implementierungen.
- [RLS ohne Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): `private.timer_receipts` und `private.finance_number_counters` verweigern absichtlich direkten Clientzugriff.
- [Unbenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): bei neuen Tabellen/geringem Datenvolumen erwartbar; nicht allein deshalb entfernen.
- [Schutz vor kompromittierten Passwörtern deaktiviert](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): im Auth-Dashboard aktivieren, soweit der Projektplan dies unterstützt. Verbundene Tools bieten keine Auth-Konfigurationsänderung an.

## Noch offen bis zur Betriebsfreigabe

1. Auth > URL Configuration: Site URL und exakte Redirect URLs auf die veröffentlichte Site einstellen bzw. bestätigen. Gemeldetes `Cannot GET /?code=…` auf localhost deutet auf die Supabase-Standardrückleitung. Anleitung: `docs/auth-email-setup.md`.
2. Echte Registrierung, Bestätigung, Login und Passwortreset durch den Besitzer prüfen. Keine fremden Personen anschreiben oder Konten ohne Auftrag anlegen.
3. Eigener SMTP-Dienst und Auth-Template-Aktivierung. 13 gebrandete E-Mail-Typen × drei Sprachen sowie 39 Vorschauen sind vorbereitet; GitHub/Sites aktiviert sie nicht automatisch in Supabase. Ohne SMTP keine bestätigte Zustellung. Workspace-Einladungen erzeugen keine automatischen E-Mails.
4. Supabase OAuth-Server/Clientregistrierung und echten MCP-Zustimmungs-/Widerrufsflow konfigurieren und prüfen. Discovery allein beweist keine funktionierende externe Verbindung.
5. Hosting bleibt owner-private. Teammitglieder/externe KI-Clients benötigen bewusst eingerichteten Hosting-Zugang.
6. Backup/Restore, Mehrverbindungsprüfung, Alarmierung und Betriebsverantwortung abschließen. Details: `docs/operations.md`.

Die implementierten Module sind geprüft und mit dem Backend verbunden. Vollständiger Produktivbetrieb bleibt bis zu diesen echten Betriebsprüfungen unbestätigt. Verbindlichen Merge-/Deploymentstatus zeigen GitHub und die Sites-Version, nicht dieses vor Veröffentlichung erstellte Dokument.

## Vollständige Demo (14.10.2026, Release-Prüfung)

Zusätzliche additive Migration führt nicht anmeldbare Demo-Mitgliedschaften mit bedingtem Auth-Fremdschlüssel ein. Die Sicherheitsprüfung schließt Demo-IDs ausdrücklich aus der Authentifizierung aus; echte Mitgliedschaften benötigen weiter echte Auth-Benutzer. Ein interner, transaktionsgebundener Seed-Kontext erlaubt ausschließlich beim berechtigten Demo-Aufbau das Einfügen der Beispielzeiten. Kein aktiver Timer wird automatisch gestartet.

Neue Demos enthalten 57 Beispielprofile plus Ersteller, 13 Projekte/Kunden/Pläne, 66 Aufgaben, 353 Zeitbuchungen, 58 Kostensätze, 28 Ausgaben und sieben Rechnungen. Bei bestehenden Demos bleiben eigene Ergänzungen erhalten. Kombinierter lokaler Check: 172 Tests in 17 Suites, TypeScript, E-Mail-Vorlagenprüfung und Produktionsbuild erfolgreich. Unabhängiges Code-/Sicherheitsreview ohne blockierende Befunde.

Die vollständige Demo-Migration `20261013223113_full_demo_experience.sql` ist noch NICHT live angewendet. Der Supabase-Connector meldet bei `apply_migration` wiederholt `Invalid or expired requestState`; die Remote-Migrationshistorie enthält weiterhin nur die oben aufgeführten fünf Migrationen. Lesender Live-Bestand vor dem Versuch: zwei Auth-Konten, drei Workspaces, zehn Zeitbuchungen und eine aktive ältere Demo. Die neue Migration reichert bestehende Demos nicht automatisch an; nach erfolgreicher Anwendung bietet die GUI dem Ersteller/Owner „Demo vervollständigen“ an.

Deployment dieser Erweiterung benötigt zuerst die erfolgreiche Migration, das angepasste Live-Rollback-Skript und den Advisor-Check. Lokales PGlite-Rollback-Skript erfolgreich: zehn Zugriffsverweigerungen, 57 nicht anmeldbare Beispielpersonen, 353 Demozeiten, geschützte Demo-Belege einschließlich Storno; Auth-Kontenzahl unverändert. Eine lokale Prüfung ersetzt nicht die noch ausstehende Live-Prüfung. Merge-/CI-/Deploymentstatus: GitHub PR #2 und Sites-Version prüfen.
