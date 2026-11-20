import { shiftDate } from './holidays.js';

/**
 * Zeitstrahl, rein gerechnet: ein Fenster aus ganzen Wochen (Montag bis Sonntag), darin Phasen als Balken.
 * Die Oberfläche rechnet nur in Tagen ab Fensterbeginn; Pixel kennt dieses Modul nicht.
 */
export interface TimelineRange { from: string; to: string; days: number }
export interface Span { starts_on: string; ends_on: string }
export interface Bar { left: number; width: number; cutLeft: boolean; cutRight: boolean }
export type DragMode = 'move' | 'start' | 'end';

const MIN_DATE = '2000-01-01', MAX_DATE = '2100-12-31';
const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
/** Tage von `from` bis `to` (kann negativ sein). */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((dow + 6) % 7));
}
/** Fenster aus `weeks` ganzen Wochen; beginnt `lead` Wochen vor der laufenden Woche, verschoben um `offset` Wochen. */
export function timelineRange(today: string, weeks: number, offset = 0, lead = 2): TimelineRange {
  const from = shiftDate(mondayOf(today), (offset - lead) * 7);
  return { from, to: shiftDate(from, weeks * 7 - 1), days: weeks * 7 };
}
export const dayIndex = (range: TimelineRange, date: string) => daysBetween(range.from, date);
export const dateAt = (range: TimelineRange, index: number) => shiftDate(range.from, index);

/** Lage eines Zeitraums im Fenster als Anteil 0…1 – oder null, wenn er ganz außerhalb liegt. */
export function barFor(range: TimelineRange, span: Span): Bar | null {
  const start = dayIndex(range, span.starts_on), end = dayIndex(range, span.ends_on) + 1;
  if (end <= 0 || start >= range.days) return null;
  const a = Math.max(0, start), b = Math.min(range.days, end);
  return { left: a / range.days, width: (b - a) / range.days, cutLeft: start < 0, cutRight: end > range.days };
}

/** Verschiebt oder dehnt einen Zeitraum um ganze Tage. Mindestens ein Tag bleibt, die Grenzen 2000–2100 gelten. */
export function dragSpan(span: Span, mode: DragMode, delta: number): Span {
  const clamp = (d: string) => d < MIN_DATE ? MIN_DATE : d > MAX_DATE ? MAX_DATE : d;
  if (mode === 'move') {
    const length = daysBetween(span.starts_on, span.ends_on);
    let start = clamp(shiftDate(span.starts_on, delta));
    if (shiftDate(start, length) > MAX_DATE) start = shiftDate(MAX_DATE, -length);
    return { starts_on: start, ends_on: shiftDate(start, length) };
  }
  if (mode === 'start') { const start = clamp(shiftDate(span.starts_on, delta)); return { starts_on: start > span.ends_on ? span.ends_on : start, ends_on: span.ends_on }; }
  const end = clamp(shiftDate(span.ends_on, delta));
  return { starts_on: span.starts_on, ends_on: end < span.starts_on ? span.starts_on : end };
}
/** Aufziehen auf leerer Fläche: Zeitraum zwischen zwei Tagen, egal in welche Richtung gezogen wurde. */
export function spanBetween(range: TimelineRange, a: number, b: number): Span {
  const lo = Math.max(0, Math.min(a, b)), hi = Math.min(range.days - 1, Math.max(a, b));
  return { starts_on: dateAt(range, lo), ends_on: dateAt(range, hi) };
}
/** Rastet einen Tagesversatz auf ganze Wochen, wenn die Ansicht grob ist. */
export const snapDays = (delta: number, step: number) => step <= 1 ? Math.round(delta) : Math.round(delta / step) * step;

/**
 * Verteilt Zeiträume auf Spuren, sodass sich in einer Spur nichts überlappt. Reihenfolge: nach Beginn,
 * dann nach `order`. Liefert je Eintrag die Spur (0 = oben) und die Zahl der Spuren.
 */
export function assignLanes<T extends Span & { id: string; order?: number }>(items: T[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.starts_on.localeCompare(b.starts_on) || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const ends: string[] = []; const lanes = new Map<string, number>();
  for (const item of sorted) {
    let lane = ends.findIndex((end) => end < item.starts_on);
    if (lane < 0) { lane = ends.length; ends.push(item.ends_on); } else ends[lane] = item.ends_on;
    lanes.set(item.id, lane);
  }
  return { lanes, count: Math.max(1, ends.length) };
}

export interface MonthSegment { key: string; year: number; month: number; days: number }
/** Monatsabschnitte des Fensters mit ihrer Breite in Tagen. */
export function monthSegments(range: TimelineRange): MonthSegment[] {
  const out: MonthSegment[] = [];
  for (let i = 0; i < range.days;) {
    const date = dateAt(range, i), year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = Math.min(range.days - i, last - Number(date.slice(8, 10)) + 1);
    out.push({ key: date.slice(0, 7), year, month, days }); i += days;
  }
  return out;
}
/** Montage des Fensters. */
export const weekStarts = (range: TimelineRange): string[] => Array.from({ length: range.days / 7 }, (_, i) => dateAt(range, i * 7));
/** Ein Name, der im Projekt noch frei ist: „Neue Phase“, „Neue Phase 2“, … */
export function freeName(base: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
