# M16 – Rechte je Konto: Module einzeln wählbar, Vorlagen statt drei Rollen

**Auftrag (22.10.2026):** „Können wir noch feinere Rollenverteilungen der User anbieten?
Personal-Manager, Projektplaner, Mitarbeiter, Admin etc. – am besten je Account die
einzelnen Module/Rechte individuell auswählbar.“ Außerdem: Mitarbeitende sehen ihre
eigene Leistung nicht (Stärkenprofil nur für die Leitung) – erledigt vorab in einem
eigenen PR.

## Ausgangslage

- Drei Rollen in `memberships.role`: `owner`, `manager`, `member` (plus `disabled`).
- 31 RLS-Policies und 24 Funktionen prüfen `current_role in ('owner','manager')`
  bzw. `private.require_role(ws, array['owner','manager'])`.
- Die Oberfläche schaltet an 73 Stellen auf `manager` (owner oder manager).
- Alles, was eine Leitung darf, darf sie komplett – Finanzen, Team, Freigaben,
  Urlaub, Bewertungen. Eine Projektplanerin ohne Finanzeinblick ist heute nicht
  abbildbar.

## Zielbild

**Module** (je Konto `none` · `view` · `edit`):

| Modul | sehen | bearbeiten |
|---|---|---|
| `projects` Projekte & Kunden | Liste, Details, Prognose (Basis: immer sehen) | anlegen, ändern, archivieren, Tags, Pläne |
| `tasks` Aufgaben | alle Aufgaben, Kanban (Basis: immer sehen) | anlegen, zuweisen, ändern, löschen |
| `time_team` Zeiten des Teams | alle Zeiteinträge, Reports, Auslastung | einreichen anderer, freigeben, zurückweisen, Freigabe aufheben |
| `absences_team` Abwesenheiten & Personal | Teamkalender aller, Urlaubskonten, Zeitkonten | entscheiden, Anspruch/Übertrag, Arbeitszeitmodell, Kapazität, Standort anderer |
| `planning` Kapazität & Lagebild | Cockpit, Langfrist, Lagebild | – (Nachsteuern läuft über `tasks: edit`) |
| `strengths` Stärkenprofile | Profile und Zuweisungsempfehlung | Aufgaben bewerten |
| `finance` Finanzen | Rechnungen, Angebote, Zahlungen, Ausgaben | alles buchen, Rechnungsprofil |
| `team` Team & Rechte | Einladungen sehen | einladen, Rechte setzen, deaktivieren (nie Owner-Rolle) |
| `settings` Workspace-Einstellungen | – | Name, Standort-Standard, Freigabepflicht, Zeitzone |

**Basisrechte jeder aktiven Person** (nicht abwählbar): eigene Zeiten und Timer,
eigene Abwesenheiten beantragen, eigenes Zeit- und Urlaubskonto, Projekt- und
Mitgliederliste (Namen – sonst lässt sich nichts zuordnen), eigene Aufgaben,
KI-Vorschläge, Hilfe, Einstellungen der eigenen Person.

**Vorlagen** füllen die Matrix vor (`src/shared/rights.ts`, `RIGHT_TEMPLATES`):

| Vorlage | projects | tasks | time_team | absences_team | planning | strengths | finance | team | settings |
|---|---|---|---|---|---|---|---|---|---|
| Administration | edit | edit | edit | edit | view | edit | edit | edit | edit |
| Projektplanung | edit | edit | view | view | view | view | none | view | none |
| Personal | view | edit | edit | edit | view | edit | none | edit | none |
| Finanzen | view | view | view | none | none | none | edit | none | none |
| Mitarbeit | view | edit | none | none | none | none | none | none | none |
| Lesezugriff | view | view | view | view | view | view | view | view | none |
| Individuell | frei | | | | | | | | |

Owner behalten alles (Rolle `owner` bleibt die Spitze, nur Owner ernennen Owner).
Bestehende Daten: `manager` → Vorlage Administration, `member` → Mitarbeit – nichts
ändert sich, bis jemand eine Vorlage wählt.

## Datenbank (M16-A)

- `memberships.rights_template text` (`admin|projektplanung|personal|finanzen|mitarbeit|lesen|individuell`, null = aus der Rolle),
  `memberships.permissions jsonb` (Matrix, null = Vorlage); Prüfung über `private.valid_permissions(jsonb)`.
- `private.rights(p_workspace uuid) returns jsonb`: aufgelöste Matrix der angemeldeten
  Person (Owner → alles `edit`; sonst `permissions`, sonst Vorlage der Rolle).
- `private.can(p_workspace uuid, p_module text, p_level text) returns boolean` (stable,
  security definer) und `private.require_can(...)` (wirft `42501`).
- **Policies** per `alter policy … using/with check`: Finanz-Tabellen → `finance`,
  `projects` insert/update → `projects:edit`, `time_entries.entry_read` → eigene oder
  `time_team:view`, `absences_*`/`vacation_balances_*` → `absences_team:edit`,
  `audit_log` → `team:view`.
- **Funktionen** (`create or replace`, Körper unverändert bis auf die Prüfung):
  `review_entry`, `review_entries`, `revoke_approval`, `submit_entries` (fremde) → `time_team:edit`;
  `set_absence_approval`, `set_vacation_entitlement`, `set_member_capacity`,
  `set_work_schedule`, `set_member_location` (fremde) → `absences_team:edit`;
  `invite_member`, `list_invitations`, `revoke_invitation` → `team` (`edit`/`view`);
  `set_member_role` bleibt Owner; neu `set_member_rights(ws, user, template, permissions)`
  → `team:edit`, nie auf Owner, nie mehr Rechte vergeben, als man selbst hat;
  `set_workspace_location`, `set_approval_required`, `rename_workspace` → `settings:edit`;
  `project_insight` → `planning:view`; Trigger `task_lifecycle` (Bewertung) →
  `strengths:edit`; `finance_require_manager` → `finance:edit`; `absence_rules`/
  `absence_notify` → `absences_team:edit`.
- MCP-Server: läuft mit dem Token der Person, RLS entscheidet; Werkzeugtexte
  „nur Leitung“ → „nur mit Recht …“.
- Tests: `tests/database.test.ts` – Vorlage Finanzen sieht Rechnungen, aber keine
  Teamzeiten; Projektplanung legt Projekte an, darf keine Zeiten freigeben; Personal
  entscheidet Abwesenheiten, sieht keine Finanzen; Individuell mit `team:edit` kann
  Rechte setzen, aber keinen Owner anfassen und nichts vergeben, was sie nicht hat.

## Oberfläche (M16-B)

- `src/shared/rights.ts`: `Module`, `Level`, `RIGHT_TEMPLATES`, `effectiveRights(membership)`,
  `can(rights, module, level)`, `templateFor(rights)`.
- `workspace.tsx`: `manager` → `can(...)` je Stelle (73 Stellen, mechanisch nach Modul);
  Navigation blendet Bereiche nach Modul ein (Team bei `team:view`, Finanzen bei
  `finance:view`, Planung bei `planning:view`); Übersicht zeigt Freigabe-Queue nur bei
  `time_team:edit`, Lagebild bei `planning:view`.
- Team: je Zeile „Rechte“ → Dialog mit Vorlage (SelectMenu) und Matrix (Modul × sehen/bearbeiten
  als Kästchen), Hinweis auf Basisrechte, Speichern über `set_member_rights`; Einladung
  mit Vorlage statt Manager/Mitglied; Rollen-Chip zeigt die Vorlage.
- Hilfe: Thema `team-rights` (Module, Vorlagen, Basisrechte), `team-roles` angepasst.
- e2e: Rechte-Dialog, Navigation je Vorlage (Finanzen sieht Finanzen, keine Planung),
  Einladung mit Vorlage; a11y-Gate.

## Reihenfolge

1. PR „Mitarbeitende sehen ihr Stärkenprofil nicht“ (sofort).
2. M16-A Datenbank + Tests + Migration `20261022100000_rechte_je_konto.sql`.
3. M16-B Oberfläche, Hilfe, e2e, STATE.md.

Nach dem Merge: eine Migration im SQL-Editor ausführen; bestehende Rollen laufen
unverändert weiter.
