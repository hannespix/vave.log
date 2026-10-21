import { holidaysBetween, shiftDate } from './holidays.js';

/** Reine Urlaubsrechnung: Werktage Mo–Fr, abzüglich Feiertage des Standorts, halbe Tage zählen 0,5. */
export interface AbsenceLike { user_id: string; starts_on: string; ends_on: string; kind: 'vacation' | 'sick' | 'holiday' | 'other'; status?: 'requested' | 'approved' | 'declined'; half_day?: '' | 'am' | 'pm' }
export interface VacationSummary { entitlement: number | null; carriedOver: number; adjustment: number; taken: number; requested: number; remaining: number | null }

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const isWorkday = (day: string) => { const dow = weekday(day); return dow >= 1 && dow <= 5; };
export const absenceStatus = (a: AbsenceLike) => a.status ?? 'approved';

/** Zählt die Arbeitstage einer Abwesenheit im Fenster [from, to] (beides optional), ohne Wochenenden und Feiertage. */
export function absenceWorkdays(a: AbsenceLike, location: string | null | undefined, from?: string, to?: string, schedule?: number[] | null): number {
  const start = from && a.starts_on < from ? from : a.starts_on, end = to && a.ends_on > to ? to : a.ends_on;
  if (start > end) return 0;
  const holidays = holidaysBetween(location, start, end);
  const works = (day: string) => schedule && schedule.length === 7 ? schedule[(weekday(day) + 6) % 7] > 0 : isWorkday(day);
  let days = 0;
  for (let day = start; day <= end; day = shiftDate(day, 1)) if (works(day) && !holidays.has(day)) days++;
  return a.half_day && days > 0 ? 0.5 : days;
}

/** Urlaubskonto einer Person für ein Jahr: Anspruch + Übertrag + Korrektur − genommen (genehmigt) − beantragt. */
export function vacationSummary(input: { entitlement: number | null | undefined; carriedOver?: number; adjustment?: number; absences: AbsenceLike[]; userId: string; year: number; location: string | null | undefined; schedule?: number[] | null }): VacationSummary {
  const from = `${input.year}-01-01`, to = `${input.year}-12-31`;
  let taken = 0, requested = 0;
  for (const a of input.absences) {
    if (a.user_id !== input.userId || a.kind !== 'vacation' || absenceStatus(a) === 'declined') continue;
    const days = absenceWorkdays(a, input.location, from, to, input.schedule);
    if (absenceStatus(a) === 'approved') taken += days; else requested += days;
  }
  const carriedOver = input.carriedOver ?? 0, adjustment = input.adjustment ?? 0;
  const entitlement = input.entitlement ?? null;
  return { entitlement, carriedOver, adjustment, taken, requested, remaining: entitlement == null ? null : round(entitlement + carriedOver + adjustment - taken - requested) };
}
const round = (n: number) => Math.round(n * 2) / 2;

/** Wer ist an welchem Tag abwesend (genehmigt oder beantragt)? Map Tag → Personen. */
export function absentPerDay(absences: AbsenceLike[], from: string, to: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const a of absences) {
    if (absenceStatus(a) === 'declined') continue;
    const start = a.starts_on < from ? from : a.starts_on, end = a.ends_on > to ? to : a.ends_on;
    for (let day = start; day <= end; day = shiftDate(day, 1)) {
      let set = result.get(day); if (!set) { set = new Set(); result.set(day, set); }
      set.add(a.user_id);
    }
  }
  return result;
}

/** Wie viele andere Personen sind während dieses Antrags gleichzeitig weg (Höchstwert über die Tage)? */
export function overlapCount(absence: AbsenceLike, others: AbsenceLike[]): number {
  const perDay = absentPerDay(others.filter((o) => o.user_id !== absence.user_id), absence.starts_on, absence.ends_on);
  let max = 0;
  for (let day = absence.starts_on; day <= absence.ends_on; day = shiftDate(day, 1)) max = Math.max(max, perDay.get(day)?.size ?? 0);
  return max;
}

/** Monatsraster: alle Tage eines Monats als ISO-Daten. */
export function monthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return days;
}

/** iCalendar-Export der genehmigten Abwesenheiten (ganztägig, Ende exklusiv). */
export function absencesIcs(absences: AbsenceLike[], names: (userId: string) => string, labels: Record<AbsenceLike['kind'], string>): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//vave.log//absences//DE', 'CALSCALE:GREGORIAN'];
  for (const a of absences) {
    if (absenceStatus(a) !== 'approved') continue;
    const uid = `${a.user_id}-${a.starts_on}-${a.ends_on}@vave.log`;
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${a.starts_on.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${shiftDate(a.ends_on, 1).replace(/-/g, '')}`, `SUMMARY:${escapeIcs(`${names(a.user_id)} – ${labels[a.kind]}${a.half_day ? ' (½)' : ''}`)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
