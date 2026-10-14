# VAVE.LOG — aktueller Arbeitsstand

14.10.2026. Repository: hannespix/vave.log. Private Site: https://vave-log.pixer.chatgpt.site.

## Anwendung

GUI in Englisch, Deutsch und vereinfachtem Chinesisch: erste Systemsprache de/zh, sonst Englisch; sichtbarer Sprachumschalter mit gespeicherter Auswahl. Anmeldung/Reset, Workspaces, Projekte, Aufgaben, Zeiterfassung/Timer, Freigaben, Berichte/CSV, Teamrollen und OAuth-Zustimmung/Widerruf. Das originale VAVE-Logo läuft in drei langsamen, variierenden Gesten ohne Wiedergabebutton; reduzierte Bewegung wird berücksichtigt. Ein einziger farbiger Punkt trennt VAVE und LOG. Der Sprachumschalter zeigt nur Globus und Sprachkürzel.

Manager/Owner erhalten Kunden, Kosten-/Verrechnungssätze, Mitarbeiter-/Freelancerplanung, Stundenbudgets, Ausgaben, Prognosen und Rechnungen. Entwürfe aus freigegebener Zeit oder manuellen Positionen; ausdrückliches Ausstellen mit atomarer Nummer und unveränderlichen Daten; verknüpftes Storno und separater Zahlungsstatus. Druck/PDF über Browser, CSV und Kalender-ICS-Export. Keine automatische Buchhaltungsanbindung, Zahlung oder E-Mail-Versendung.

Erster Start bietet leeren Workspace (voreingestellt) oder recherchierte VAVE-Beispieldaten: acht öffentliche Studioreferenzen, 49 öffentlich genannte Personen und 63 erfundene Profile bilden das fiktive Szenario mit 100 Mitarbeitenden und zwölf freien Spezialisten. Acht öffentliche und 17 erfundene Projekte füllen die Ansichten; zwölf zusätzliche Großprojekte haben zusammen 22,55 Mio. EUR geplantes Auftragsvolumen. Aufgaben, Arbeitszeiten, Kostensätze, Budgets, Ausgaben sowie offene, bezahlte und stornierte Beispielrechnungen füllen die echten Ansichten. Operative Angaben sind fiktiv und keine Aussage über VAVEs tatsächliche Umsätze oder heutige Beschäftigte. Beispielpersonen haben keine Auth-Konten oder Zugangsdaten. Demo-Rechnungen können über die regulären Abläufe ausprobiert werden; Datenbank und Exporte erhalten dauerhaft DEMO-/Nicht-bezahlen-Markierungen. Bestehende Demos bieten „Demo vervollständigen“; Quellen bleiben in der Entwicklungsdokumentation. Ersteller/Owner kann ausschließlich seinen markierten Demo-Workspace archivieren.

47 MCP-Werkzeuge verwenden dieselben validierten Services und Nutzerrechte wie die GUI; keine privilegierten Supabase-Schlüssel im Runtime-System. Endpoint `/api/mcp` (Sites reserviert `/mcp`).

## Supabase

Projekt `vave-log`, Referenz `ieeujtmpxqxmfyietqgw`, Frankfurt. Angewandte Migrationen; lokale Dateiversionen entsprechen der Remote-Historie:

- `20261013202303_vave_log`
- `20261013202642_secure_bootstrap_and_indexes`
- `20261013220039_agency_finance`
- `20261013220054_researched_demo_workspace`
- `20261013220233_finance_foreign_key_indexes`
- `20261014052911_full_demo_experience`
- `20261014060022_enterprise_demo_scale`
- `20261014072035_project_planning_insights`

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
- [RLS ohne Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): `private.timer_receipts`, `private.finance_number_counters` und `private.demo_seed_context` verweigern absichtlich direkten Clientzugriff.
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

Die vollständige Demo-Migration wurde am 14.10.2026 um 05:29 UTC erfolgreich als `20261014052911_full_demo_experience.sql` live angewendet; die lokale Dateiversion entspricht der Remote-Historie. Der vorherige Connectorfehler tritt bei diesem Schreibvorgang nicht mehr auf. Die Migration reichert bestehende Demos nicht automatisch an; die GUI bietet dem Ersteller/Owner „Demo vervollständigen“ an.

Das angepasste `tests/live/agency-smoke.sql` ist auf echtem Supabase PostgreSQL erfolgreich: zehn erwartete Zugriffsverweigerungen, Ausstellung/Wiederholung, unveränderliche Rechnungsdaten, Storno, Zahlungsstatus, drei Audit-Aktionen, Demo-Erstellung/Archivierung, 57 nicht anmeldbare Beispielpersonen und 353 Demozeiten. Der zusätzliche Test-Stornobeleg bleibt DEMO-markiert. Alle Testdaten wurden zurückgerollt. Vorher/nachher unverändert: zwei Auth-Konten, drei Workspaces, zehn Zeitbuchungen und eine aktive ältere Demo; kein Seed-Kontext blieb bestehen.

Security-/Performance-Advisors nach der Migration: keine neuen unerwarteten Befunde, keine fehlenden Fremdschlüsselindizes. Bestehende Hinweise und Betriebsgrenzen siehe oben. GitHub PR #2 ist in `main` gemergt (`0fbb36e0d48f451423996d1d0772da82566394f4`); der zugehörige CI-Lauf `38515702849` prüfte 172 Tests und 24 Desktop-/Mobil-Browserabläufe erfolgreich. Dieses Release synchronisiert nur die angewandte Migrationsversion und die Live-Prüfnachweise; den abschließenden Veröffentlichungsstatus zeigt die Sites-Version.


## Agenturgröße und ruhige Demo-Oberfläche (14.10.2026)

Version 3 ergänzt 55 fiktive Mitarbeitende und zwölf internationale Großprojekte: insgesamt 100 Demo-Angestellte, zwölf freie Spezialisten, 25 Projekte, 102 Aufgaben, 113 Kostensätze einschließlich Ersteller, 64 Ausgaben und 45 Rechnungen. Das neue Portfolio plant 130.000 Stunden und 22,55 Mio. EUR Auftragsvolumen bei rund 28,3 Prozent Projektbeitrag vor nicht erfassten Gemeinkosten. Diese Zahlen sind ausschließlich fiktive Pläne, keine veröffentlichten VAVE-Geschäftszahlen. Sechs Wochen enthalten 3.713 Zeitbuchungen mit zur Teamplanung passenden Zuordnungen. Im Beispieldurchlauf enthalten die aktuellen Monatsrechnungen jeweils mehr als eine Million EUR bezahlt und offen; Monatswerte verändern sich mit dem Erstellungsdatum.

Zeitlisten und Finanzübersicht laden bis zu 50.000 Einträge seitenweise. Fehlende Seiten, geänderte Mengen, doppelte IDs und Fehler verhindern unvollständige Ergebnisse. Die Finanzübersicht trennt gesamtes Projektplanvolumen, fakturierte Nettowerte sowie aktuellen Bezahlt-/Offen-Status. Das ist keine Bank-/Cashflowrechnung. Der allgemeine Demo-Hinweis mit Vervollständigen/Archivieren erscheint nur unter Einstellungen; Musterbelege behalten ihre DEMO-Markierungen.

Migration `20261014060022_enterprise_demo_scale` ist live angewandt. Das Live-Rollback-Skript bestand einschließlich Größenordnung, Margen, Stundenlimits, Rollenrechten, Idempotenz und DEMO-Rechnungen. Alle Testdaten sind zurückgerollt. Lokaler vollständiger Check: 218 Tests in 19 Suites, TypeScript, E-Mail-Vorlagen und Produktionsbuild erfolgreich. Unabhängiges Review ohne Blocker. Advisors zeigen keine neuen unerwarteten Befunde. Vorhandene v2-Daten werden exakt erhalten; beim v1-Zwischenschritt werden wie bisher nur völlig unkonfigurierte Kunden-/Unternehmensfelder ergänzt. Browser-/Merge-/Deploymentstatus siehe zugehörigen GitHub- und Sites-Release.


## Verbundene Workflows und Projektprognosen (14.10.2026)

Projektkontext verbindet Projekte, Aufgaben, Zeiten, Auswertungen und Finanzplanung/Rechnungen. Neue Aufgaben, Zeiten und Rechnungsentwürfe übernehmen das gewählte Projekt. Suche, Schnellfilter und aufklappbare Aufgabenfilter bleiben beim Neuladen und über Browser-Zurück erhalten, auch beim Workspace-Wechsel. Unbekannte Workspaces/Projekte zeigen ausdrücklich einen nicht verfügbaren Kontext. Tastatur-Sprunglinks verändern diesen Kontext nicht.

Die ursprüngliche Projektplanung ergänzte optionale Deadline und gemeldeten Fortschritt; bestehende Werte und Demo-Daten bleiben unverändert. Manager/Owner öffnen die Projektprognose bei Bedarf im Dialog: sämtliche bis heute erfassten Projektstunden, Restbudget, geschätzter Gesamtaufwand und ein Szenario für den Endtermin bei gleichbleibendem Tempo. Grundlage sind die letzten 28 Kalendertage, mindestens sieben beobachtete Tage und drei Buchungstage. Fehlender/veralteter Fortschritt, fehlende Historie oder pausierte Projekte erzeugen keine grüne Terminprognose. Ungewichtete Aufgabenzahlen werden separat gezeigt. GUI und neues MCP-Werkzeug `get_project_insight` verwenden dieselbe Berechnung; sämtliche neuen Texte liegen auf EN/DE/ZH vor.

Migration `20261014072035_project_planning_insights` ist live angewandt. Das exakte Rollback-Skript `tests/live/project-insight-smoke.sql` bestand auf Supabase: 1.185 Gesamtminuten, davon 1.045 im jüngsten Zeitraum, acht erwartete Zugriffsverweigerungen und Erhalt vorhandener Planungswerte. Vorher/nachher unverändert: zwei Auth-Konten, fünf Workspaces, 47 Projekte, 4.077 Zeitbuchungen und 53 Rechnungen. Keine Testdaten blieben zurück. Advisors zeigen keine neuen unerwarteten Befunde. Unabhängiges Review ist einschließlich Navigation-/Workspace-Korrekturen abgeschlossen. Lokaler vollständiger Check: 298 Tests in 24 Suites, TypeScript, E-Mail-Vorlagenprüfung und Produktionsbuild erfolgreich. CI prüft zusätzlich Desktop-/Mobil-Browserabläufe am PR; den tatsächlichen Merge-/Deploymentstatus zeigen GitHub und Sites.


## PWA und automatischer Projektfortschritt (14.10.2026)

Das vollständige Tool ist als PWA installierbar. Dezente Installation unter Anmeldung/Einstellungen, EN/DE/ZH-Anleitung, App-Icons, eigenes Fenster und sichere Bildschirmränder. Der Service Worker speichert nur drei öffentliche Offline-Gestaltungsdateien; keine Projektdaten, API-Antworten, Exporte oder Tokens. Arbeiten und Speichern benötigen Internet; es gibt keine Offline-Schreibwarteschlange. Updates werden nur ausdrücklich aus den Einstellungen aktiviert und laden andere Tabs nicht automatisch neu. Details: `docs/pwa.md`.

Fortschritt wird jetzt dynamisch aus Aufgaben berechnet. Vollständige Aufwandsschätzungen gewichten erledigte Aufgaben; bei fehlenden Schätzungen wird der klar bezeichnete ungewichtete Aufgabenanteil gezeigt. Laufende Aufgaben erhalten keinen erfundenen Teilfortschritt. Alte manuelle Prozentwerte bleiben gespeichert, steuern aber weder Anzeige noch Prognose. Die Detailansicht erklärt Aufgabenstatus, Meilensteine, Verbrauch, Budgetprognose, Endtermin und fehlende Daten mit passenden Kontextlinks. Alle erfassten Aufgaben erledigt bedeutet ausdrücklich nicht, dass ein Kunde das Projekt abgenommen hat. Aufgaben erhalten optionale Aufwandsschätzung und Meilenstein-Kennzeichen, auch über MCP.

Demo-Version5 ergänzt Deadlines, Aufwandsschätzungen und Meilensteine auf nachgewiesenen Seed-Datensätzen. Bestehende Status, Zeiten, Budgets, Finanzen und Nutzer-Planungswerte werden erhalten. Neue Demodaten ergeben überwiegend gesunde Großprojekte sowie nachvollziehbare Termin-/Budgetrisiken. Details und Rollback-Prüfung: `docs/demo-planning.md`.

Release-Prüfung und tatsächlichen Merge-/Deploymentstatus dokumentieren GitHub CI und die Sites-Version. Native OS-Installationsdialoge und echte iOS-Homescreen-Nutzung sind nicht durch Headless-Browserprüfungen belegt. Die oben beschriebenen offenen Betriebsfreigaben bleiben bestehen.


## Owner-Verwaltung und Löschung (14.10.2026)

Unter Einstellungen öffnet „Studios & Demos verwalten“ eine gemeinsame Verwaltung aktiver und archivierter eigener Workspaces. Auch ohne aktiven Workspace bleibt die Verwaltung erreichbar. Die endgültige Löschung verlangt den exakten Namen und eine ausdrückliche Bestätigung; laufende Timer blockieren sie. Aktuelle echte Owner dürfen auch übernommene, ursprünglich von anderen erstellte Demos löschen. Mitgliedschaften werden entfernt, Login-Konten und andere Workspaces bleiben erhalten.

Eine transaktions-, Workspace- und Akteur-gebundene private Freigabe erlaubt ausschließlich die notwendige Datenbereinigung innerhalb dieser Owner-Operation. Normale Schutzregeln für Rechnungen, genehmigte Zeiten und den letzten Owner bleiben bestehen. Fehlgeschlagene Operationen werden vollständig zurückgerollt. GUI und MCP nutzen dieselbe benutzergebundene Schnittstelle; 47 MCP-Werkzeuge einschließlich Vorschau und endgültiger Löschung. Details: `docs/workspace-administration.md`.

Unabhängiges Review ohne offene kritische oder wichtige Befunde. Lokalisierte MCP-Fehler, unveränderte normale Zeitbuchungen und aktuelle Berechtigungen sind Teil der Regressionstests. Die Timer-Sperrstrategie ist per Code-Review geprüft; eine echte Mehrverbindungs-Lastprüfung ist weiterhin nicht belegt.

Release-Nachweis: 407 Tests in 35 Dateien, TypeScript, 13 E-Mail-Typen in drei Sprachen und Produktionsbuild erfolgreich. Demo-/Fortschrittsmigrationen `20261014102144` und `20261014102151` sind live angewandt; das exakte Demo-Rollback-Skript bestand, Bestandszahlen blieben unverändert. Die Owner-Löschmigration wurde am 14.10.2026 um 13:31 UTC über den direkten Supabase-Connector erfolgreich als `20261014133100_workspace_administration.sql` angewandt. Der frühere Fehler `Invalid or expired requestState` trat beim erneuten Versuch nicht mehr auf; eine abgelaufene Anmeldung war nicht nachgewiesen. Die Remote-Migrationshistorie bestätigt die Aktivierung. Das unveränderte Rollback-Skript `tests/live/workspace-admin-smoke.sql` bestand live: zwei temporäre Workspaces gelöscht, fünf unberechtigte Rollen/Zugriffe abgewiesen, archivierte übertragene Demos und Rechnungen geprüft, laufende Timer geschützt, andere Workspaces und Auth-Konten unverändert. Alle Testdaten wurden zurückgerollt. Bestandszahlen danach: 2 Auth-Konten, 7 Workspaces, 97 Projekte, 396 Aufgaben, 11.503 Zeiteinträge, 143 Rechnungen. Keine vorhandenen Studios wurden gelöscht.

Der Security Advisor meldet weiterhin bewusst geschützte private Tabellen ohne Client-Policies und bestehende authentifizierte SECURITY-DEFINER-RPCs; die neuen öffentlichen Lösch-RPCs sind SECURITY INVOKER. Der Schutz gegen kompromittierte Passwörter ist weiterhin nicht aktiviert (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Durchsuchbare Auswahlmenüs (14.10.2026)

Alle sichtbaren Select-Felder nutzen eine gemeinsame React-Select-Komponente im VAVE-Stil. Ab acht Optionen erscheint eine Suche mit mehreren Suchbegriffen, Akzentnormalisierung und chinesischer Texteingabe. Projekte zeigen Kunden, Status und Farbe; Personen Initialen, Rolle und gegebenenfalls Studio. Lange Listen sind nach Status bzw. Studio/Rolle gruppiert. Kunden sind auch anhand Kontakt und Adresse auffindbar. Kleine Menüs und der Sprachumschalter bleiben kompakt. Zeitzonen erlauben weiterhin eigene IANA-Werte.

Die bestehenden Optionslisten und Berechtigungsgrenzen bleiben maßgeblich. Eine unsichtbare native Form-Brücke erhält FormData, Pflichtfeldvalidierung und deaktivierte historische Optionen. Menüs werden innerhalb des jeweils aktiven Dialogs eingeblendet; Escape, Pfeiltasten und Enter bleiben nutzbar. Hinweise und Screenreader-Texte sind auf EN/DE/ZH vorhanden. React Select ist exakt auf 5.10.2 gepinnt. Browserprüfungen umfassen lange Projekt-/Personenlisten, kombinierte Suche, leere Treffer, Dialogfokus und Formularwerte auf Desktop und Mobil.
