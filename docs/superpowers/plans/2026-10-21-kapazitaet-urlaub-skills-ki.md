# Fahrplan M7–M14: Kapazität, Urlaub, Lagebild, Stärkenprofile, KI-Vorschläge

Stand 21.10.2026. Auftrag: Kapazitätsplanung (kurz- und langfristig), „wer macht was, wo brennt es“
mit agiler Nachsteuerung, Stärkenprofile aus Zeit- und Projektdaten, Abwesenheiten mit
Urlaubsplanung und regionalen Feiertagen, sowie Vorschläge für die Zeiterfassung aus dem
ChatGPT-Workspace (Kalender, Aufgaben, Fireflies-Meetings, Box).

Was schon da ist und worauf aufgebaut wird: Wochenkapazität je Person (`memberships.weekly_capacity_minutes`),
Abwesenheiten (`absences`: Urlaub/Krank/Feiertag/Sonstiges), Auslastungs-Report (Soll/Ist je Person),
Aufgaben mit Schätzung, Zuständigkeit, Termin und Meilenstein-Flag, Zeiten auf Aufgaben, Projektprognose
(`forecastProject`), Finanzplanung mit Positionen je Person (`EstimateLine.planned_minutes`), Audit-Log
für Aufgabenänderungen, MCP-Server (`/api/mcp`, 47 Werkzeuge, OAuth über Supabase Auth).

Reihenfolge: Grundlagen zuerst (Standort/Feiertage, Arbeitszeitmodell), dann Urlaub, dann die
Planungs- und Lagebilder, dann Stärkenprofile, zuletzt der KI-Posteingang (braucht nichts von den
anderen, ist aber am wenigsten dringend für den Alltag und hängt an externen Voraussetzungen).
Jeder Meilenstein ist ein eigener PR mit Migration, Tests, Hilfeartikel und STATE.md-Eintrag.

---

## M7 · Standort und regionale Feiertage

**Ziel:** Feiertage müssen nicht mehr von Hand als Abwesenheit eingetragen werden; sie folgen dem
Standort der Person und zählen automatisch in Soll, Urlaubsplanung und Kapazität.

- **Daten:** `memberships.location` (Land + Region, z. B. `DE-BW`, `DE-BY`, `AT-9`, `CH-ZH`), gepflegt
  wie die Kapazität über `set_member_location` (Leitung; die Person selbst darf den eigenen Standort
  setzen). Workspace-Standard in `workspaces.default_location`.
- **Feiertagsrechner** als reine Funktion `src/shared/holidays.ts`: bewegliche Feiertage aus dem
  Osterdatum (Gauß), feste Feiertage, regionale Regeln für alle 16 deutschen Länder (inkl. Fronleichnam,
  Reformationstag, Allerheiligen, Buß- und Bettag, Augsburger Friedensfest, Mariä Himmelfahrt),
  Österreich (bundesweit + Landesfeiertage), Schweiz (Kantone). Kein Netzabruf, keine Abhängigkeit.
  Erweiterbar über eine Tabelle je Region.
- **Wirkung:** `utilization`/`countWorkdays` ziehen Feiertage des Standorts ab; der Auslastungs-Report
  nennt „Feiertage“ getrennt. Abwesenheiten der Art „Feiertag“ bleiben für Sonderfälle (Betriebsferien).
- **UI:** Team-Tab: Spalte Standort; Workspace-Einstellung Standard-Standort; Kalender (M8) zeigt Feiertage
  als eigene Schicht.
- **Tests:** Osterformel gegen bekannte Jahre, Stichproben je Region (z. B. 1.11. nur in BW/BY/NW/RP/SL,
  Buß- und Bettag nur SN), Werktagszählung mit Feiertag.

## M8 · Urlaubsplanung

**Ziel:** Ein Urlaubsantrag ist in zehn Sekunden gestellt, die Leitung sieht Überschneidungen und
Restansprüche, das Team sieht einen Kalender.

- **Daten:** `memberships.vacation_days_per_year` (z. B. 30; Teilzeit anteilig über M9),
  `vacation_balances` (Jahr, Anspruch, Übertrag, manuelle Korrektur, Bemerkung).
  `absences` erhalten `status` (`requested`/`approved`/`declined`), `half_day` (`''|'am'|'pm'`),
  `decided_by`/`decided_at`. Krankheit braucht keine Freigabe; Urlaub und Sonstiges ja, sobald der
  Workspace „Freigabe erforderlich“ eingeschaltet hat (Standard an, sobald es eine Leitung gibt).
- **Rechnung** (`src/shared/vacation.ts`, rein): genommene Urlaubstage = Werktage im Zeitraum minus
  Feiertage des Standorts, halbe Tage zählen 0,5; Rest = Anspruch + Übertrag + Korrektur − genommen −
  beantragt (getrennt ausgewiesen).
- **UI:** Neuer Bereich **„Abwesenheiten“** (Menüpunkt, auf dem Handy unter „Mehr“) mit
  (1) Monats-/Jahreskalender als Raster Personen × Tage (Farben je Art, Feiertage grau, Wochenende
  schraffiert, heutiger Tag markiert), (2) eigener Antrag mit Vorschau „zählt 4,5 Tage, Rest danach 12“,
  (3) Freigabeliste für die Leitung mit Überschneidungs-Hinweis („3 von 5 im Team Motion gleichzeitig weg“)
  und Kapazitätsauswirkung, (4) Jahresübersicht je Person. Benachrichtigungen (vorhandenes
  `notifications`-Muster) bei Entscheidung. ICS-Export der Abwesenheiten.
- **MCP:** `list_absences`, `request_absence`, `decide_absence`.

## M9 · Arbeitszeitmodell und Zeitkonto

**Ziel:** Teilzeit, 4-Tage-Woche und Gleitzeit sauber abbilden; „umfassende Zeiterfassung“ heißt:
Soll je Tag, Ist je Tag, Saldo.

- **Daten:** `memberships.work_schedule` (JSON: Minuten je Wochentag Mo–So; Summe = Wochenkapazität,
  die bestehende Kapazität bleibt als Summe erhalten), `memberships.schedule_valid_from`.
- **Rechnung:** Soll je Tag aus dem Modell, 0 an Feiertagen/Abwesenheiten; Zeitkonto = Σ(Ist − Soll)
  seit Stichtag, Stichtag und Startsaldo je Person pflegbar (Gleitzeitübertrag).
- **UI:** Zeiten-Bereich: Wochenleiste mit Soll/Ist je Tag und Saldo; Team-Tab: Modell bearbeiten;
  Report: Zeitkonto je Person. Urlaubstage (M8) zählen nur Tage mit Soll > 0.

## M10 · Kapazitäts-Cockpit (kurzfristig, 1–8 Wochen)

**Ziel:** „Wer macht was in den nächsten Wochen, wer ist frei, wer ist überladen?“

- **Rechnung** (`src/shared/capacity.ts`, rein): je Person und Woche verfügbare Minuten (Modell −
  Abwesenheiten − Feiertage) gegen **geplante Last** = Restaufwand zugewiesener offener Aufgaben
  (Schätzung − bereits gebuchte Zeit, mindestens 0), verteilt bis zum Aufgaben-/Projekttermin
  (gleichmäßig; ohne Termin: in die aktuelle Woche). Aufgaben ohne Schätzung erscheinen als Zähler
  („3 ungeschätzte“), nie als 0.
- **UI:** Neuer Bereich **„Planung“** (Leitung), Reiter „Kurzfristig“: Heatmap Personen × Wochen mit
  Auslastung in % (grün < 80, gelb 80–100, rot > 100, grau = abwesend), Klick auf eine Zelle listet die
  Aufgaben dieser Person in dieser Woche; **agile Nachsteuerung direkt in der Zelle**: Aufgabe einer
  anderen Person geben, Termin schieben, Schätzung anpassen (bestehende `saveTask`-Wege). Spalte „nicht
  zugewiesen“ je Woche zeigt freie Arbeit.
- **Eigene Sicht** für Mitglieder: „Meine Woche“ auf der Startseite (Soll, geplant, gebucht).

## M11 · Langfrist-Kapazität (Quartal bis Jahr)

**Ziel:** Reicht das Team für die Pipeline? Was passiert, wenn Projekt X dazukommt?

- **Bedarf** je Projekt und Monat aus der Finanzplanung (`EstimateLine.planned_minutes` je Person oder
  Rolle) minus bereits gebuchter Zeit, verteilt von heute bis zum Projekttermin; ohne Planung aus dem
  Zeitbudget (`budget_minutes`). Angebote (M6-E) als „wahrscheinlich“ mit Gewichtung.
- **Angebot** = Summe der Arbeitszeitmodelle minus genehmigte Abwesenheiten und Feiertage.
- **UI:** Reiter „Langfristig“: Balken je Monat (Bedarf gestapelt je Projekt vs. Angebot), Tabelle Projekt ×
  Monat; **Szenario** ohne Speichern: Projekt hinzufügen (Budget, Zeitraum), Person pausieren, Freelancer
  mit n Stunden/Woche – Wirkung sofort sichtbar.

## M12 · Lagebild „Wo brennt es“

**Ziel:** Eine Seite, die in 30 Sekunden sagt, welche Projekte hinten dran sind und warum, mit den
nächsten Handgriffen.

- **Gesundheitswert je Projekt** (`src/shared/project-health.ts`, rein, erklärbar – keine Blackbox): Signale
  mit Gewicht und Begründungstext: Termin-Risiko aus `forecastProject` (Fertigstellung nach Termin),
  Budget-Burn vs. Fortschritt (> 110 % der anteiligen Zeit), überfällige Aufgaben, Meilenstein überfällig,
  unzugewiesene Aufgaben mit nahem Termin, keine gebuchte Zeit seit 14 Tagen bei offenem Projekt,
  Kapazitätslücke (M10: zugewiesene Personen über 100 %), fehlende Schätzungen. Ergebnis: Ampel
  (grün/gelb/rot) + Gründe + Trend zur Vorwoche.
- **UI:** Startseite der Leitung bekommt „Lagebild“ oben: rote Projekte zuerst, je Karte die Gründe und
  Sofort-Aktionen (Aufgabe umverteilen, Termin verschieben, Nachricht an Zuständige, Projekt öffnen).
  Filter nach Kunde/Person. Für Mitglieder: nur eigene Projekte, ohne Finanzsignale.
- **MCP:** `get_portfolio_health` für Auswertungen aus ChatGPT/Claude.

## M13 · Stärkenprofile: wer ist wofür am besten?

**Ziel:** Aus den vorhandenen Daten belastbar ableiten, wer welche Arbeit schnell und gut erledigt –
als Entscheidungshilfe bei der Zuweisung, nie als Überwachung.

- **Klassifikation der Arbeit:** `tasks.tags` und `projects.tags` (z. B. „3D“, „Konzept“, „Motion“,
  „Pitch“), Vorschläge aus Titel/Projekt per Stichwortliste des Workspaces; ohne Tags gilt der Kunde/
  das Projekt als Kategorie.
- **Signale je Person × Kategorie** (`src/shared/skills.ts`, rein, mit Mindeststichprobe n ≥ 3):
  - *Geschwindigkeit:* Median von gebuchter Zeit ÷ Schätzung bei erledigten Aufgaben (1,0 = wie geplant);
    Durchlaufzeit (Start „doing“ bis „done“ aus dem Audit-Log); Anteil pünktlich erledigt.
  - *Qualität (Näherungen, ehrlich benannt):* Wiedereröffnungsquote (done → doing/todo aus dem Audit-Log),
    zurückgewiesene Zeiten (M1-B), optionale **Abschlussbewertung** 1–5 durch die Leitung beim Erledigen
    (ein Klick, freiwillig) – das einzige echte Qualitätsmaß; alles andere sind Indizien.
  - *Erfahrung:* Stunden und Aufgaben je Kategorie, letzte Tätigkeit.
- **UI:** Team-Tab → Person → „Stärken“ (Radar/Balken je Kategorie, Zahlen mit n); Aufgaben-Dialog:
  **Empfehlung** beim Zuweisen („Lena: 0,9× Schätzung bei 7 Motion-Aufgaben, diese Woche 6 h frei“),
  sortiert nach Fit × freier Kapazität (M10). Sichtbar für die Leitung; jede Person sieht das eigene Profil.
- **Grenzen, die im Produkt stehen:** kleine Stichproben, Schätzqualität beeinflusst „Geschwindigkeit“,
  Teamarbeit wird nicht abgebildet; Zahlen sind Gesprächsgrundlage, kein Ranking. Export nur mit
  Leitungsrecht; Mitbestimmungspflichten (Betriebsrat) liegen beim Betreiber.

## M14 · KI-Vorschläge für die Zeiterfassung (ChatGPT-Workspace)

**Ziel:** Eine Person fragt in ChatGPT „Was habe ich gestern für VAVE gemacht?“ – ChatGPT liest Kalender,
Aufgaben, Fireflies-Protokolle und Box-Aktivität über seine eigenen Connectoren, ordnet Projekte zu und
schickt **Vorschläge** an vave.log. Dort werden sie mit einem Klick zu Entwürfen; nichts wird ungefragt
gebucht.

- **Daten:** `time_suggestions` (workspace, user, Quelle `chatgpt|calendar|fireflies|box|other`,
  Projekt-/Aufgaben-Vorschlag, Datum, Minuten, Notiz, Belege als Liste `{title,url?,snippet}`, Konfidenz
  0–1, Status `pending|accepted|dismissed`, `entry_id` nach Übernahme, `external_id` für Idempotenz).
  RLS: nur die eigene Person liest/schreibt; Leitung sieht nichts (private Rohdaten).
- **MCP-Werkzeuge:** `propose_time_entries` (Liste; prüft Projekt/Aufgabe, dedupliziert über
  `external_id`, markiert Überschneidung mit schon gebuchter Zeit), `list_time_suggestions`,
  `match_project` (Fuzzy-Suche über Projektcode/-name/Kunde/Aufgaben – damit ChatGPT nicht raten muss).
  Serverseitige Deckel: 50 Vorschläge je Aufruf, 500 offene je Person.
- **UI:** Startseite und Zeiten: **Posteingang „Vorschläge“** mit Badge; je Vorschlag Quelle, Beleg,
  vorgeschlagenes Projekt (änderbar), Dauer (änderbar), „Übernehmen“ → Entwurf (`saveEntry`),
  „Verwerfen“, „Alle vom Tag übernehmen“. Timer-Konflikt und Tagesdeckel (24 h) werden geprüft.
- **Anbindung ChatGPT:** vave.log ist bereits ein Remote-MCP-Server mit OAuth (Discovery unter
  `/.well-known/oauth-protected-resource`). Im ChatGPT-Workspace (Business/Enterprise, Admin schaltet
  „Connectors/MCP“ frei) wird vave.log als Connector eingetragen; jede Person meldet sich einmal mit ihrem
  vave.log-Konto an (Supabase-OAuth, offener Punkt 4 in STATE.md muss dafür live sein). Mitgeliefert:
  Hilfeartikel mit Schritt-für-Schritt-Anleitung, ein **GPT-Instruktionstext** („Lies Kalender/Fireflies/Box
  für den Tag, ordne jedem Block ein Projekt über `match_project` zu, runde auf 15 Minuten, schicke
  `propose_time_entries`, buche nie selbst“) und eine Beispiel-Automation (ChatGPT „Tasks“, täglich 17:30).
  Alternative ohne ChatGPT-Business: derselbe Weg mit Claude (MCP-Connector) – gleiche Werkzeuge.
- **Nicht Teil von M14:** vave.log selbst liest keine Kalender/Fireflies/Box-Daten (keine weiteren
  OAuth-Integrationen, keine Rohdaten im Tool). Die Zuordnung passiert im KI-Workspace; vave.log hält nur
  die Vorschläge und deren Belege.

---

## Reihenfolge und Abhängigkeiten

```
M7 Feiertage ──► M8 Urlaub ──► M10 Kurzfrist-Kapazität ──► M12 Lagebild
      │              ▲                 │
      └──► M9 Arbeitszeitmodell ───────┘──► M11 Langfrist-Kapazität
M13 Stärkenprofile  (braucht Audit-Log + Tags; nutzt M10 für „frei“)
M14 KI-Posteingang  (unabhängig; braucht live OAuth für ChatGPT)
```

Jeder Meilenstein: Migration (additiv, RLS, Definer-Funktionen für Leitungsschreibzugriff), reine
Rechenfunktionen in `src/shared/` mit Unit-Tests, UI in de/en/zh, e2e inkl. Barrierefreiheits-Audit,
MCP-Werkzeuge, Hilfeartikel, STATE.md. Migrationen gehen als SQL an den Betreiber (SQL-Editor), die
Oberfläche degradiert tolerant, solange eine Migration noch nicht eingespielt ist.
