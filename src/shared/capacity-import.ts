import { shiftDate } from './holidays.js';
import type { GridValue, SheetMerge } from './xlsx-read.js';
import type { PlanImport } from './types.js';

/**
 * Erkennt eine Kapazitätsmatrix, wie sie in Agenturen als Excel-Tabelle lebt:
 * eine Kopfzeile mit Kalenderwochen („CW 23“, „KW 23“), links davon Projekt, Position,
 * Person, angebotene und geplante Stunden; darunter Blöcke – das Team mit freier Kapazität,
 * je Projekt eine Kopfzeile mit Phasen als Beschriftung über den Wochen und Zeilen je
 * Rolle und Person, am Ende Urlaub. Übernommen werden Projekte, Phasen, Zeilen und
 * Wochenstunden. Team- und Urlaubsblock sind abgeleitete Werte und werden nur gezählt:
 * Freie Kapazität rechnet das Tool selbst, Abwesenheiten kommen aus dem Kalender.
 */
export interface ParsedWeek { col: number; week: number; start: string }
export interface ParsedRow { role: string; person: string; offered_hours: number | null; cells: Record<string, number>; hours: number; line: number }
export interface ParsedPhase { name: string; starts_on: string; ends_on: string }
export interface ParsedProject { name: string; offered_hours: number | null; phases: ParsedPhase[]; rows: ParsedRow[]; line: number }
export interface ParsedPlan { title: string; weeks: ParsedWeek[]; projects: ParsedProject[]; team: { role: string; person: string }[]; absencePeople: string[]; persons: string[]; roles: string[]; hours: number; warnings: string[] }
export class PlanParseError extends Error { constructor(message: string) { super(message); this.name = 'PlanParseError'; } }

const text = (v: GridValue | undefined) => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
const num = (v: GridValue | undefined): number | null => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && /^-?\d{1,6}([.,]\d{1,4})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : null;
const WEEK = /^(?:CW|KW|W|WK|WEEK|WOCHE)\s*\.?\s*0?(\d{1,2})$/i;
const TEAM = /^(team|kapazit[aä]t|capacity|free capacity|freie kapazit[aä]t|auslastung)$/i;
const ABSENCE = /^(urlaub|vacation|holiday|holidays|abwesen\w*|absence\w*|leave|ferien|feiertage?)\b/i;

/** Montag der ISO-Kalenderwoche `week` im Jahr `year`. */
export function isoWeekStart(year: number, week: number): string {
  const jan4 = `${year}-01-04`, dow = new Date(`${jan4}T12:00:00Z`).getUTCDay() || 7;
  return shiftDate(jan4, 1 - dow + (week - 1) * 7);
}
/** Zahl der ISO-Wochen eines Jahres (52 oder 53). */
export const isoWeeksInYear = (year: number) => { const last = isoWeekStart(year, 53); return shiftDate(last, 3).slice(0, 4) === String(year) ? 53 : 52; };

function findHeader(grid: GridValue[][]): { row: number; weeks: { col: number; week: number }[] } | null {
  let best: { row: number; weeks: { col: number; week: number }[] } | null = null;
  grid.slice(0, 60).forEach((line, row) => {
    const weeks: { col: number; week: number }[] = [];
    line.forEach((cell, col) => { const m = WEEK.exec(text(cell)); if (m && Number(m[1]) >= 1 && Number(m[1]) <= 53) weeks.push({ col, week: Number(m[1]) }); });
    if (weeks.length >= 2 && (!best || weeks.length > best.weeks.length)) best = { row, weeks };
  });
  return best;
}
/** Jahr der ersten Wochenspalte: aus Monatszeile oder Titel („06 I JUNE 26“, „CAPACITY 26“, „2026“), sonst das Ersatzjahr. */
function findYear(grid: GridValue[][], headerRow: number, firstCol: number, fallback: number): number {
  const candidates: string[] = [];
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 4); r--) { for (let c = firstCol; c >= 0; c--) { const v = text(grid[r]?.[c]); if (v) { candidates.push(v); break; } } }
  for (let r = 0; r < headerRow; r++) for (const cell of grid[r] ?? []) { const v = text(cell); if (v) candidates.push(v); }
  for (const v of candidates) {
    const four = /\b(20\d{2})\b/.exec(v); if (four) return Number(four[1]);
    const two = /(?:^|[^\d.,])(\d{2})$/.exec(v); if (two && Number(two[1]) >= 20 && Number(two[1]) <= 60 && /[A-Za-zÄÖÜäöü]/.test(v)) return 2000 + Number(two[1]);
  }
  return fallback;
}

/** Spalten links der Wochen: Projekt, Position, Person, angebotene Stunden. Ohne Beschriftung gilt A–D. */
function leftColumns(header: GridValue[], firstWeekCol: number) {
  let project = -1, role = -1, person = -1, offered = -1;
  for (let c = 0; c < firstWeekCol; c++) {
    const v = text(header[c]).toLowerCase(); if (!v) continue;
    if (role < 0 && /position|rolle|role|leistung|funktion|skill/.test(v)) role = c;
    else if (person < 0 && /person|mitarbeiter|name|wer|who|resource|ressource/.test(v)) person = c;
    else if (offered < 0 && /ange|offer|budget|verkauft|sold/.test(v)) offered = c;
    else if (project < 0 && /projekt|project|job|kunde|client/.test(v)) project = c;
  }
  // Fehlt eine Beschriftung, gilt die übliche Folge: Position, Person, angebotene Stunden nebeneinander.
  if (role < 0 && person < 0) { role = Math.min(1, firstWeekCol - 1); person = Math.min(2, firstWeekCol - 1); }
  else if (person < 0 && role + 1 < firstWeekCol && role + 1 !== offered) person = role + 1;
  else if (role < 0 && person > 0 && person - 1 !== project) role = person - 1;
  if (offered < 0 && person >= 0 && person + 1 < firstWeekCol && person + 1 !== role && person + 1 !== project) offered = person + 1;
  if (project < 0) project = [0, 1, 2].find((c) => c !== role && c !== person && c !== offered && c < firstWeekCol) ?? 0;
  return { project, role, person, offered };
}

export function parseCapacityGrid(grid: GridValue[][], options: { year?: number; merges?: SheetMerge[] } = {}): ParsedPlan {
  const header = findHeader(grid);
  if (!header) throw new PlanParseError('Keine Kalenderwochen gefunden. Erwartet wird eine Zeile mit Spalten wie „KW 23“ oder „CW 23“.');
  const firstCol = header.weeks[0].col;
  let year = findYear(grid, header.row, firstCol, options.year ?? new Date().getUTCFullYear());
  const weeks: ParsedWeek[] = []; let previous = 0;
  for (const w of header.weeks) {
    if (previous && w.week < previous) year++; // Jahreswechsel: nach KW 52/53 folgt KW 1
    previous = w.week;
    if (w.week > isoWeeksInYear(year)) continue; // KW 53 in einem Jahr mit 52 Wochen
    weeks.push({ col: w.col, week: w.week, start: isoWeekStart(year, w.week) });
  }
  const cols = leftColumns(grid[header.row], firstCol);
  const warnings: string[] = [];
  const projects: ParsedProject[] = [], team: { role: string; person: string }[] = [], absencePeople: string[] = [];
  let section: 'team' | 'project' | 'absence' | null = null, current: ParsedProject | null = null;
  const titleRow = grid.slice(0, header.row).flat().map(text).find((v) => v.length > 2 && !WEEK.test(v)) ?? '';
  const mergeEnd = (row: number, col: number) => options.merges?.find((m) => m.row === row && m.col === col)?.colEnd ?? null;

  for (let r = header.row + 1; r < grid.length; r++) {
    const line = grid[r] ?? [];
    const label = text(line[cols.project]), role = text(line[cols.role]), person = text(line[cols.person]);
    const hours: Record<string, number> = {}; let sum = 0; const labels: { col: number; name: string }[] = [];
    for (const w of weeks) {
      const cell = line[w.col], n = num(cell);
      if (n != null) { if (n > 0) { hours[w.start] = Math.round(n * 100) / 100; sum += n; } }
      else if (text(cell)) labels.push({ col: w.col, name: text(cell) });
    }
    if (!label && !role && !person && !sum && !labels.length) continue;
    // Block-Überschrift: Text in der Projektspalte, keine Person.
    if (label && !person && !(role && sum > 0)) {
      if (TEAM.test(label)) { section = 'team'; current = null; continue; }
      if (ABSENCE.test(label)) { section = 'absence'; current = null; continue; }
      if (section === 'absence' && !labels.length && !sum && !num(line[cols.offered])) continue; // Beschriftung im Urlaubsblock
      if (section === 'absence' && sum > 0) continue; // Zeile wie „Chinese New Year“ mit Stunden für alle
      section = 'project';
      current = { name: label, offered_hours: cols.offered >= 0 ? num(line[cols.offered]) : null, phases: phasesFrom(labels, weeks, r, mergeEnd), rows: [], line: r + 1 };
      projects.push(current);
      continue;
    }
    if (section === 'team' || (section === null && person)) { if (person) team.push({ role, person }); continue; }
    if (section === 'absence') { if (person && !absencePeople.includes(person)) absencePeople.push(person); continue; }
    if (!current) continue;
    if (!person && !role) { if (labels.length && !current.phases.length) current.phases = phasesFrom(labels, weeks, r, mergeEnd); continue; }
    current.rows.push({ role, person, offered_hours: cols.offered >= 0 ? num(line[cols.offered]) : null, cells: hours, hours: Math.round(sum * 100) / 100, line: r + 1 });
  }
  // Phasen ohne Ende reichen bis zur letzten verplanten Woche des Projekts.
  for (const p of projects) {
    const planned = p.rows.flatMap((row) => Object.keys(row.cells)).sort();
    const lastPlanned = planned[planned.length - 1];
    p.phases.forEach((ph, i) => { if (ph.ends_on === '') { const next = p.phases[i + 1]?.starts_on; ph.ends_on = next ? shiftDate(next, -1) : shiftDate(lastPlanned && lastPlanned >= ph.starts_on ? lastPlanned : ph.starts_on, 6); } });
  }
  const kept = projects.filter((p) => p.rows.length || p.phases.length);
  if (!kept.length) throw new PlanParseError('Kalenderwochen erkannt, aber keine Projektzeilen. Unter der Kopfzeile werden Blöcke mit Projektname und Zeilen je Person erwartet.');
  const empty = kept.filter((p) => !p.rows.some((row) => row.hours > 0));
  if (empty.length) warnings.push(`Ohne Stunden: ${empty.map((p) => p.name).join(', ')}`);
  const persons = [...new Set(kept.flatMap((p) => p.rows.map((row) => row.person)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const roles = [...new Set(kept.flatMap((p) => p.rows.map((row) => row.role)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { title: titleRow, weeks, projects: kept, team, absencePeople, persons, roles, hours: Math.round(kept.reduce((a, p) => a + p.rows.reduce((b, row) => b + row.hours, 0), 0) * 100) / 100, warnings };
}

/** Phasen aus den Beschriftungen einer Projektkopfzeile. „50 % Concept“ und „100 % Concept“ sind Stände derselben Phase. */
function phasesFrom(labels: { col: number; name: string }[], weeks: ParsedWeek[], row: number, mergeEnd: (row: number, col: number) => number | null): ParsedPhase[] {
  const out: (ParsedPhase & { base: string })[] = [];
  const lastWeekAt = (col: number) => { let hit: ParsedWeek | null = null; for (const w of weeks) if (w.col <= col) hit = w; return hit; };
  labels.forEach((label, i) => {
    const start = weeks.find((w) => w.col === label.col); if (!start) return;
    const merged = mergeEnd(row, label.col);
    const endWeek = merged != null && merged > label.col ? lastWeekAt(merged) : labels[i + 1] ? lastWeekAt(labels[i + 1].col - 1) : null;
    const base = label.name.replace(/^\d{1,3}\s*%\s*/, '').trim() || label.name;
    const ends = endWeek ? shiftDate(endWeek.start, 6) : '';
    const last = out[out.length - 1];
    if (last && last.base.toLowerCase() === base.toLowerCase()) { last.ends_on = ends; return; }
    const count = out.filter((p) => p.base.toLowerCase() === base.toLowerCase()).length;
    out.push({ name: count ? `${base} ${count + 1}` : base, base, starts_on: start.start, ends_on: ends });
  });
  return out.map(({ name, starts_on, ends_on }) => ({ name: name.slice(0, 120), starts_on, ends_on }));
}

// ---------------------------------------------------------------- Zuordnung

export interface MatchMember { user_id: string; display_name: string; email: string }
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
/** Kürzel, unter denen eine Person in Tabellen üblicherweise steht: Vorname, Initialen, erste drei Buchstaben … */
export function personCodes(member: MatchMember): string[] {
  const name = fold(member.display_name), parts = name.split(' ').filter(Boolean), local = fold(member.email.split('@')[0] ?? '');
  const codes = new Set<string>([name, name.replace(/ /g, ''), local, local.replace(/ /g, '')]);
  if (parts.length) {
    const first = parts[0], last = parts[parts.length - 1];
    codes.add(first); codes.add(first.slice(0, 3)); codes.add(first.slice(0, 2));
    if (parts.length > 1) { codes.add(last); codes.add(parts.map((p) => p[0]).join('')); codes.add(first[0] + last.slice(0, 2)); codes.add(first.slice(0, 2) + last[0]); codes.add(first[0] + last); codes.add(last.slice(0, 3)); }
  }
  codes.delete('');
  return [...codes];
}
/** Schlägt je Kürzel aus der Tabelle eine Person vor – nur, wenn der Treffer eindeutig ist. */
export function suggestPeople(persons: string[], members: MatchMember[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const table = members.map((m) => ({ id: m.user_id, codes: personCodes(m), name: fold(m.display_name) }));
  for (const person of persons) {
    const key = fold(person);
    const exact = table.filter((m) => m.name === key || m.codes[2] === key);
    const hits = exact.length ? exact : table.filter((m) => m.codes.includes(key));
    out[person] = hits.length === 1 ? hits[0].id : null;
  }
  return out;
}
export interface MatchProject { id: string; name: string; code: string }
/** Vorhandenes Projekt mit gleichem Namen oder Code, sonst null (wird angelegt). */
export function suggestProjects(names: string[], projects: MatchProject[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of names) {
    const key = fold(name);
    const hits = projects.filter((p) => fold(p.name) === key || fold(p.code) === key);
    out[name] = hits.length === 1 ? hits[0].id : null;
  }
  return out;
}
/** Projektcode aus dem Namen, eindeutig gegenüber `taken` (wird fortgeschrieben). */
export function projectCode(name: string, taken: Set<string>): string {
  const words = fold(name).toUpperCase().split(' ').filter(Boolean);
  const base = (words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] ?? 'PRJ').slice(0, 4)) || 'PRJ';
  for (let n = 1; n < 10000; n++) { const code = `${base}-${String(n).padStart(2, '0')}`; if (!taken.has(code.toLowerCase())) { taken.add(code.toLowerCase()); return code; } }
  return `${base}-${Date.now()}`;
}

export interface PlanMapping {
  /** Kürzel → Person; null = Zeile bleibt offen, das Kürzel steht als Notiz dabei. */
  people: Record<string, string | null>;
  /** Projektname → vorhandenes Projekt; null = anlegen; 'skip' = nicht übernehmen. */
  projects: Record<string, string | null>;
  replace: boolean;
}
/** Baut aus dem erkannten Plan und der Zuordnung den Import für die Datenbank (Stunden → Minuten). */
export function buildPlanImport(plan: ParsedPlan, mapping: PlanMapping, existingCodes: string[]): PlanImport {
  const taken = new Set(existingCodes.map((c) => c.toLowerCase()));
  const minutes = (hours: number | null) => hours == null ? null : Math.min(6000000, Math.max(0, Math.round(hours * 60)));
  const projects = plan.projects.filter((p) => mapping.projects[p.name] !== 'skip').map((p) => {
    const id = mapping.projects[p.name] ?? null;
    const budget = minutes(p.offered_hours);
    return {
      project_id: id,
      ...(id ? {} : { create: { code: projectCode(p.name, taken), name: p.name.slice(0, 160), budget_minutes: budget ?? 0 } }),
      ...(id && budget ? { budget_minutes: budget } : {}),
      phases: p.phases.map((ph) => ({ name: ph.name, starts_on: ph.starts_on || null, ends_on: ph.ends_on || null })),
      rows: p.rows.map((row) => {
        const user = row.person ? mapping.people[row.person] ?? null : null;
        return { user_id: user, service_type: row.role ? row.role.slice(0, 60) : null, offered_minutes: minutes(row.offered_hours), note: user ? '' : row.person.slice(0, 240),
          cells: Object.fromEntries(Object.entries(row.cells).map(([week, hours]) => [week, Math.min(10080, Math.round(hours * 60))]).filter(([, m]) => (m as number) > 0)) as Record<string, number> };
      }),
    };
  });
  return { replace: mapping.replace, service_types: [...new Set(projects.flatMap((p) => p.rows.map((r) => r.service_type)).filter((s): s is string => !!s))], projects };
}
