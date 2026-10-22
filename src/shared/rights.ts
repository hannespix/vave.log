/**
 * Rechte je Konto, rein gerechnet und deckungsgleich mit der Datenbank
 * (Migration 20261022100000_rechte_je_konto.sql, private.template_rights).
 * Die Oberfläche blendet damit nur aus, was die Datenbank ohnehin verweigert;
 * entscheiden tut RLS. Owner haben alles, bestehende manager/member laufen
 * über die Vorlagen „leitung“ und „mitarbeit“ unverändert weiter.
 */
export const MODULES = ['projects', 'tasks', 'time_team', 'absences_team', 'planning', 'strengths', 'finance', 'team', 'settings'] as const;
export type Module = typeof MODULES[number];
export type Level = 'none' | 'view' | 'edit';
export type Rights = Record<Module, Level>;
export const TEMPLATES = ['admin', 'leitung', 'projektplanung', 'personal', 'finanzen', 'mitarbeit', 'lesen'] as const;
export type Template = typeof TEMPLATES[number];
export type RightsTemplate = Template | 'individuell';
export interface RightsMembership { role: 'owner' | 'manager' | 'member' | 'disabled'; rights_template?: string | null; permissions?: Partial<Record<string, string>> | null }

/** Welche Stufen ein Modul kennt: Projekte und Aufgaben sieht jede Person, Planung lässt sich nur sehen, Einstellungen nur bearbeiten. */
export const MODULE_LEVELS: Record<Module, Level[]> = {
  projects: ['view', 'edit'], tasks: ['view', 'edit'], time_team: ['none', 'view', 'edit'], absences_team: ['none', 'view', 'edit'],
  planning: ['none', 'view'], strengths: ['none', 'view', 'edit'], finance: ['none', 'view', 'edit'], team: ['none', 'view', 'edit'], settings: ['none', 'edit'],
};
export const TEMPLATE_RIGHTS: Record<Template, Rights> = {
  admin: { projects: 'edit', tasks: 'edit', time_team: 'edit', absences_team: 'edit', planning: 'view', strengths: 'edit', finance: 'edit', team: 'edit', settings: 'edit' },
  leitung: { projects: 'edit', tasks: 'edit', time_team: 'edit', absences_team: 'edit', planning: 'view', strengths: 'edit', finance: 'edit', team: 'view', settings: 'edit' },
  projektplanung: { projects: 'edit', tasks: 'edit', time_team: 'view', absences_team: 'view', planning: 'view', strengths: 'view', finance: 'none', team: 'view', settings: 'none' },
  personal: { projects: 'view', tasks: 'edit', time_team: 'edit', absences_team: 'edit', planning: 'view', strengths: 'edit', finance: 'none', team: 'edit', settings: 'none' },
  finanzen: { projects: 'view', tasks: 'view', time_team: 'view', absences_team: 'none', planning: 'none', strengths: 'none', finance: 'edit', team: 'none', settings: 'none' },
  mitarbeit: { projects: 'view', tasks: 'edit', time_team: 'none', absences_team: 'none', planning: 'none', strengths: 'none', finance: 'none', team: 'none', settings: 'none' },
  lesen: { projects: 'view', tasks: 'view', time_team: 'view', absences_team: 'view', planning: 'view', strengths: 'view', finance: 'view', team: 'view', settings: 'none' },
};
/** Keine Mitgliedschaft (oder deaktiviert): nur die Basisrechte. */
export const NO_RIGHTS: Rights = { projects: 'view', tasks: 'view', time_team: 'none', absences_team: 'none', planning: 'none', strengths: 'none', finance: 'none', team: 'none', settings: 'none' };

export const rank = (level: string | null | undefined): number => level === 'edit' ? 2 : level === 'view' ? 1 : 0;
export const isTemplate = (value: unknown): value is Template => typeof value === 'string' && (TEMPLATES as readonly string[]).includes(value);
/** Vorlage, die eine Mitgliedschaft darstellt (Owner → admin, Altrollen → leitung/mitarbeit). */
export function templateFor(m: RightsMembership | undefined): RightsTemplate {
  if (!m || m.role === 'disabled') return 'mitarbeit';
  if (m.role === 'owner') return 'admin';
  if (m.rights_template === 'individuell') return 'individuell';
  if (isTemplate(m.rights_template)) return m.rights_template;
  return m.role === 'manager' ? 'leitung' : 'mitarbeit';
}
/** Aufgelöste Matrix wie private.rights(): Owner alles, sonst Matrix, sonst Vorlage, sonst Rolle. Unbekannte Werte fallen auf die Vorlage zurück. */
export function effectiveRights(m: RightsMembership | undefined): Rights {
  if (!m || m.role === 'disabled') return { ...NO_RIGHTS };
  if (m.role === 'owner') return { ...TEMPLATE_RIGHTS.admin };
  const template = templateFor(m);
  const base = { ...TEMPLATE_RIGHTS[template === 'individuell' ? (m.role === 'manager' ? 'leitung' : 'mitarbeit') : template] };
  if (template !== 'individuell' || !m.permissions) return base;
  for (const module of MODULES) { const level = m.permissions[module]; if (level && (MODULE_LEVELS[module] as string[]).includes(level)) base[module] = level as Level; }
  return base;
}
export const can = (rights: Rights, module: Module, level: Level = 'view'): boolean => rank(rights[module]) >= rank(level);
/** Darf die Person mit `own` die Matrix `target` vergeben? Nie mehr, als sie selbst hat (Spiegel von set_member_rights). */
export function grantable(own: Rights, target: Rights): Module[] { return MODULES.filter((module) => rank(target[module]) > rank(own[module])); }
/** Liefert die Vorlage, deren Matrix genau passt, sonst „individuell“. */
export function matchTemplate(rights: Rights): RightsTemplate {
  for (const template of TEMPLATES) if (MODULES.every((module) => TEMPLATE_RIGHTS[template][module] === rights[module])) return template;
  return 'individuell';
}
/** Bereiche der Navigation, die eine Matrix freischaltet. */
export function visibleAreas(rights: Rights): { team: boolean; finance: boolean; planning: boolean } {
  return { team: can(rights, 'team') || can(rights, 'absences_team') || can(rights, 'strengths'), finance: can(rights, 'finance'), planning: can(rights, 'planning') };
}
/** Namen und Erklärungen (deutsche Schlüssel für den Sprachkatalog). */
export const TEMPLATE_NAMES: Record<RightsTemplate, string> = { admin: 'Administration', leitung: 'Leitung', projektplanung: 'Projektplanung', personal: 'Personal', finanzen: 'Finanzen', mitarbeit: 'Mitarbeit', lesen: 'Lesezugriff', individuell: 'Individuell' };
export const TEMPLATE_HINTS: Record<RightsTemplate, string> = {
  admin: 'Alles – auch Team, Rechte und Einstellungen.', leitung: 'Alles außer Team verwalten (bisherige Leitung).', projektplanung: 'Projekte und Aufgaben planen, Team und Zeiten sehen, keine Finanzen.',
  personal: 'Abwesenheiten, Zeiten und Stärken des Teams betreuen, Personen einladen.', finanzen: 'Rechnungen, Angebote und Zahlungen; Zeiten nur sehen.', mitarbeit: 'Eigene Zeiten und Aufgaben, Projekte sehen.', lesen: 'Alles sehen, nichts ändern.', individuell: 'Eigene Zusammenstellung je Modul.',
};
export const MODULE_NAMES: Record<Module, string> = { projects: 'Projekte & Kunden', tasks: 'Aufgaben', time_team: 'Zeiten des Teams', absences_team: 'Abwesenheiten & Personal', planning: 'Kapazität & Lagebild', strengths: 'Stärkenprofile', finance: 'Finanzen', team: 'Team & Rechte', settings: 'Workspace-Einstellungen' };
export const MODULE_HINTS: Record<Module, string> = {
  projects: 'Sehen: Liste und Details. Bearbeiten: anlegen, ändern, archivieren, Tags.', tasks: 'Sehen: alle Aufgaben. Bearbeiten: anlegen, zuweisen, ändern, löschen (eigene Aufgaben immer).',
  time_team: 'Sehen: Zeiten aller Personen und Reports. Bearbeiten: freigeben, zurückweisen, Freigabe aufheben.', absences_team: 'Sehen: Teamkalender und Konten. Bearbeiten: entscheiden, Anspruch, Arbeitszeitmodell, Kapazität, Standort anderer.',
  planning: 'Sehen: Kapazitäts-Cockpit, Langfristplanung, Lagebild, Projektprognose.', strengths: 'Sehen: Profile und Zuweisungsempfehlung. Bearbeiten: Aufgaben bewerten.',
  finance: 'Sehen: Rechnungen, Angebote, Zahlungen. Bearbeiten: alles buchen.', team: 'Sehen: Einladungen. Bearbeiten: einladen, Rechte setzen (nie Owner-Rollen).', settings: 'Bearbeiten: Standort-Standard, Freigabepflicht für Abwesenheiten.',
};
export const LEVEL_NAMES: Record<Level, string> = { none: 'Kein Zugriff', view: 'Sehen', edit: 'Bearbeiten' };
