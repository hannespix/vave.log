import { holidaysBetween, makeupDaysBetween, shiftDate } from './holidays.js';
import { dayTarget, effectiveSchedule, type ScheduledMember } from './schedule.js';
import { absenceStatus, type AbsenceLike } from './vacation.js';
import { isoWeek, mondayOf } from './capacity.js';

/**
 * Kapazitätsplan als Matrix, rein gerechnet: Personen × Kalenderwochen × Projekte.
 * Oben das Team mit freier Kapazität (Arbeitszeitmodell − Feiertage − genehmigte
 * Abwesenheiten − Planstunden), darunter je Projekt die Zeilen aus Leistungsart
 * und Person mit Stunden je Woche, den Phasen als Balken über den Wochen und der
 * gebuchten Zeit daneben. Ersetzt die Excel-Matrix: Summen laufen immer über den
 * ganzen Zeitraum, jede Person erscheint einmal, Feiertage und Teilzeit zählen.
 */
export interface MatrixWeek { start: string; end: string; week: number; month: string; current: boolean }
export interface MatrixMember extends ScheduledMember { role?: string }
export interface MatrixRowInput { id: string; project_id: string; user_id: string | null; service_type_id: string | null; offered_minutes: number | null; note: string; position: number }
export interface MatrixPhaseInput { id: string; project_id: string; name: string; position: number; starts_on: string | null; ends_on: string | null; budget_minutes: number }
export interface MatrixInput {
  members: MatrixMember[]; rows: MatrixRowInput[]; phases: MatrixPhaseInput[];
  cells: { row_id: string; week_start: string; minutes: number }[];
  actuals: { project_id: string; user_id: string; week_start: string; minutes: number }[];
  /** Geplante Minuten je Zeile außerhalb des sichtbaren Ausschnitts (Gesamtsumme minus sichtbare Wochen). */
  outside?: Map<string, number>;
  absences: AbsenceLike[]; from: string; weeks: number; today: string; defaultLocation?: string | null;
}
export interface MatrixPerson {
  user_id: string;
  /** Soll laut Arbeitszeitmodell abzüglich Feiertage; null ohne gepflegtes Modell. */
  target: (number | null)[];
  /** Davon durch genehmigte Abwesenheiten entfallen. */
  absent: number[];
  available: (number | null)[];
  planned: number[];
  /** Verfügbar minus geplant; negativ = überbucht. */
  free: (number | null)[];
  service_types: string[];
}
export interface MatrixRow extends MatrixRowInput { cells: number[]; actual: number[]; visible: number; total: number }
export interface MatrixPhase { id: string; name: string; starts_on: string | null; ends_on: string | null; budget_minutes: number; from: number; to: number }
export interface MatrixProject { project_id: string; rows: MatrixRow[]; planned: number[]; actual: number[]; total: number; offered: number; phases: MatrixPhase[] }
export interface Matrix { weeks: MatrixWeek[]; people: MatrixPerson[]; projects: MatrixProject[]; open: number[]; planned: number[]; available: number[]; overbooked: number }

/** `count` Kalenderwochen ab der Woche von `from` (Mo–So), höchstens 53. */
export function matrixWeeks(from: string, count: number, today: string): MatrixWeek[] {
  const start = mondayOf(from), current = mondayOf(today);
  return Array.from({ length: Math.max(1, Math.min(53, Math.round(count))) }, (_, i) => {
    const s = shiftDate(start, i * 7);
    // Der Donnerstag entscheidet über Woche und Monat (ISO 8601).
    return { start: s, end: shiftDate(s, 6), week: isoWeek(s), month: shiftDate(s, 3).slice(0, 7), current: s === current };
  });
}

export function capacityMatrix(input: MatrixInput): Matrix {
  const weeks = matrixWeeks(input.from, input.weeks, input.today);
  const index = new Map(weeks.map((w, i) => [w.start, i]));
  const zeros = () => weeks.map(() => 0);
  const horizonFrom = weeks[0].start, horizonTo = weeks[weeks.length - 1].end;
  const cellsByRow = new Map<string, number[]>();
  for (const c of input.cells) { const i = index.get(c.week_start); if (i == null) continue; let line = cellsByRow.get(c.row_id); if (!line) cellsByRow.set(c.row_id, line = zeros()); line[i] += c.minutes; }
  const actualByKey = new Map<string, number[]>();
  for (const a of input.actuals) { const i = index.get(a.week_start); if (i == null) continue; const key = `${a.project_id}:${a.user_id}`; let line = actualByKey.get(key); if (!line) actualByKey.set(key, line = zeros()); line[i] += a.minutes; }

  // Gebuchte Zeit steht je Projekt und Person nur einmal da – auch wenn die Person dort zwei Rollen hat.
  const actualShown = new Set<string>();
  const projects = new Map<string, MatrixProject>();
  for (const r of [...input.rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
    let block = projects.get(r.project_id);
    if (!block) projects.set(r.project_id, block = { project_id: r.project_id, rows: [], planned: zeros(), actual: zeros(), total: 0, offered: 0, phases: [] });
    const cells = cellsByRow.get(r.id) ?? zeros();
    const key = `${r.project_id}:${r.user_id}`;
    const actual = r.user_id && !actualShown.has(key) ? actualByKey.get(key) ?? zeros() : zeros();
    if (r.user_id) actualShown.add(key);
    const visible = cells.reduce((a, b) => a + b, 0);
    const total = visible + Math.max(0, input.outside?.get(r.id) ?? 0);
    block.rows.push({ ...r, cells, actual, visible, total });
    cells.forEach((m, i) => { block.planned[i] += m; }); actual.forEach((m, i) => { block.actual[i] += m; });
    block.total += total; block.offered += r.offered_minutes ?? 0;
  }
  // Gebuchte Zeit von Personen ohne Planzeile im Projekt zählt in der Projektsumme mit.
  for (const [key, line] of actualByKey) { const [projectId] = key.split(':'); const block = projects.get(projectId); if (block && !actualShown.has(key)) line.forEach((m, i) => { block.actual[i] += m; }); }
  for (const p of [...input.phases].sort((a, b) => a.position - b.position || (a.starts_on ?? '').localeCompare(b.starts_on ?? ''))) {
    const block = projects.get(p.project_id); if (!block) continue;
    let from = -1, to = -1;
    if (p.starts_on && p.ends_on && p.starts_on <= horizonTo && p.ends_on >= horizonFrom) {
      // Eine Woche gehört zur Phase, wenn ihr Donnerstag im Zeitraum liegt; kurze Phasen bleiben trotzdem sichtbar.
      weeks.forEach((w, i) => { const thursday = shiftDate(w.start, 3); if (thursday >= p.starts_on! && thursday <= p.ends_on!) { if (from < 0) from = i; to = i; } });
      if (from < 0) { const i = weeks.findIndex((w) => w.end >= p.starts_on! && w.start <= p.ends_on!); from = to = i; }
    }
    block.phases.push({ id: p.id, name: p.name, starts_on: p.starts_on, ends_on: p.ends_on, budget_minutes: p.budget_minutes, from, to });
  }

  const open = zeros(), plannedByUser = new Map<string, number[]>(), typesByUser = new Map<string, string[]>();
  for (const block of projects.values()) for (const r of block.rows) {
    if (!r.user_id) { r.cells.forEach((m, i) => { open[i] += m; }); continue; }
    let line = plannedByUser.get(r.user_id); if (!line) plannedByUser.set(r.user_id, line = zeros());
    r.cells.forEach((m, i) => { line![i] += m; });
    if (r.service_type_id) { const list = typesByUser.get(r.user_id) ?? []; if (!list.includes(r.service_type_id)) list.push(r.service_type_id); typesByUser.set(r.user_id, list); }
  }
  let overbooked = 0;
  const people: MatrixPerson[] = input.members.filter((m) => m.role !== 'disabled').map((m) => {
    const schedule = effectiveSchedule(m);
    const holidays = holidaysBetween(m.location ?? input.defaultLocation ?? null, horizonFrom, horizonTo), makeup = makeupDaysBetween(m.location ?? input.defaultLocation ?? null, horizonFrom, horizonTo);
    const own = input.absences.filter((a) => a.user_id === m.user_id && absenceStatus(a) === 'approved');
    const planned = plannedByUser.get(m.user_id) ?? zeros();
    const target: (number | null)[] = [], absent: number[] = [], available: (number | null)[] = [], free: (number | null)[] = [];
    weeks.forEach((w, i) => {
      if (!schedule) { target.push(null); absent.push(0); available.push(null); free.push(null); return; }
      let soll = 0, ist = 0;
      for (let day = w.start; day <= w.end; day = shiftDate(day, 1)) {
        soll += dayTarget(schedule, day, holidays.get(day), null, makeup.has(day)) ?? 0;
        ist += dayTarget(schedule, day, holidays.get(day), own.find((a) => a.starts_on <= day && a.ends_on >= day) ?? null, makeup.has(day)) ?? 0;
      }
      target.push(soll); absent.push(soll - ist); available.push(ist); free.push(ist - planned[i]);
      if (planned[i] > ist) overbooked++;
    });
    return { user_id: m.user_id, target, absent, available, planned, free, service_types: typesByUser.get(m.user_id) ?? [] };
  });
  const planned = zeros(), available = zeros();
  for (const p of people) weeks.forEach((_, i) => { planned[i] += p.planned[i]; available[i] += p.available[i] ?? 0; });
  open.forEach((m, i) => { planned[i] += m; });
  return { weeks, people, projects: [...projects.values()], open, planned, available, overbooked };
}

/** Farbstufe einer Teamzelle: frei, knapp, voll, überbucht, abwesend – oder ohne Soll. */
export function freeLevel(person: MatrixPerson, i: number): 'unknown' | 'off' | 'over' | 'full' | 'tight' | 'free' {
  const available = person.available[i]; if (available == null) return 'unknown';
  if (available === 0) return person.planned[i] > 0 ? 'over' : 'off';
  const load = person.planned[i] / available;
  return load > 1 ? 'over' : load >= 0.95 ? 'full' : load >= 0.75 ? 'tight' : 'free';
}

/** Stunden als kurze Zahl: 40, 7,5 – ohne Nachkommastellen, wo keine sind. */
export function hoursText(minutes: number, locale = 'de'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(minutes / 6) / 10);
}
/** Liest eine Stundeneingabe („8“, „7,5“, „7.5“, „1:30“); leer = 0, ungültig = null. */
export function parseHours(text: string): number | null {
  const value = text.trim(); if (value === '') return 0;
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(value);
  const hours = clock ? Number(clock[1]) + Number(clock[2]) / 60 : /^\d{1,3}([.,]\d{1,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) return null;
  return Math.round(hours * 60);
}

/** Phase, in deren Zeitraum ein Tag liegt – nur wenn es genau eine ist (Spiegel der Datenbankregel beim Buchen). */
export function phaseForDay<T extends { id: string; project_id: string; starts_on: string | null; ends_on: string | null }>(phases: T[], projectId: string, day: string): T | null {
  const hits = phases.filter((p) => p.project_id === projectId && p.starts_on && p.ends_on && p.starts_on <= day && p.ends_on >= day);
  return hits.length === 1 ? hits[0] : null;
}
/** Leistungsart, mit der eine Person im Plan eines Projekts steht – nur wenn es genau eine ist. */
export function serviceTypeForPerson(rows: { project_id: string; user_id: string | null; service_type_id: string | null }[], projectId: string, userId: string): string | null {
  const types = new Set(rows.filter((r) => r.project_id === projectId && r.user_id === userId && r.service_type_id).map((r) => r.service_type_id!));
  return types.size === 1 ? [...types][0] : null;
}
