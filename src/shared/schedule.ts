import { holidaysBetween, shiftDate } from './holidays.js';
import { absenceStatus, type AbsenceLike } from './vacation.js';

/**
 * Arbeitszeitmodell und Zeitkonto, rein gerechnet. Ein Modell sind sieben
 * Minutenwerte Montag…Sonntag. Ohne Modell gilt die Wochenkapazität gleichmäßig
 * auf Mo–Fr (wie bisher); ohne beides ist das Soll unbekannt.
 */
export type WorkSchedule = [number, number, number, number, number, number, number];
export interface ScheduledMember { user_id: string; weekly_capacity_minutes?: number | null; work_schedule?: number[] | null; location?: string | null; balance_start_on?: string | null; balance_start_minutes?: number | null }
export interface DayTarget { day: string; target: number; holiday: string | null; absence: AbsenceLike | null }
export interface TimeAccount { days: DayTarget[]; targetMinutes: number; actualMinutes: number; deltaMinutes: number }

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = So
/** Modellindex Mo=0 … So=6 aus dem JS-Wochentag. */
const scheduleIndex = (day: string) => (weekday(day) + 6) % 7;
export const isSchedule = (value: unknown): value is WorkSchedule => Array.isArray(value) && value.length === 7 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 1440);
export const scheduleTotal = (schedule: WorkSchedule) => schedule.reduce((a, b) => a + b, 0);
/** Wirksames Modell einer Person: eigenes Modell, sonst Kapazität/5 auf Mo–Fr, sonst null. */
export function effectiveSchedule(member: ScheduledMember): WorkSchedule | null {
  if (isSchedule(member.work_schedule)) return member.work_schedule;
  const weekly = member.weekly_capacity_minutes;
  if (weekly == null) return null;
  const daily = Math.round(weekly / 5);
  return [daily, daily, daily, daily, daily, 0, 0];
}
/** Soll eines Tages: Modellwert, 0 an Feiertagen und ganztägigen Abwesenheiten, halbiert bei halben Tagen. */
export function dayTarget(schedule: WorkSchedule | null, day: string, holiday: string | null | undefined, absence: AbsenceLike | null | undefined): number | null {
  if (!schedule) return null;
  const base = schedule[scheduleIndex(day)];
  if (holiday || !base) return 0;
  if (!absence) return base;
  return absence.half_day ? Math.round(base / 2) : 0;
}
const absenceOn = (absences: AbsenceLike[], userId: string, day: string) => absences.find((a) => a.user_id === userId && absenceStatus(a) === 'approved' && a.starts_on <= day && a.ends_on >= day) ?? null;

/** Soll, Ist und Differenz einer Person je Tag im Zeitraum (inklusive). Ohne Modell bleibt das Soll null. */
export function timeAccount(member: ScheduledMember, entries: { user_id: string; work_date: string; minutes: number }[], absences: AbsenceLike[], from: string, to: string, defaultLocation: string | null = null): TimeAccount | null {
  const schedule = effectiveSchedule(member);
  if (!schedule || from > to) return null;
  const holidays = holidaysBetween(member.location ?? defaultLocation, from, to);
  const actualByDay = new Map<string, number>();
  for (const e of entries) if (e.user_id === member.user_id && e.work_date >= from && e.work_date <= to) actualByDay.set(e.work_date, (actualByDay.get(e.work_date) ?? 0) + e.minutes);
  const days: DayTarget[] = [];
  let targetMinutes = 0, actualMinutes = 0;
  for (let day = from; day <= to; day = shiftDate(day, 1)) {
    const holiday = holidays.get(day) ?? null, absence = absenceOn(absences, member.user_id, day);
    const target = dayTarget(schedule, day, holiday, absence) ?? 0;
    targetMinutes += target; actualMinutes += actualByDay.get(day) ?? 0;
    days.push({ day, target, holiday, absence });
  }
  return { days, targetMinutes, actualMinutes, deltaMinutes: actualMinutes - targetMinutes };
}
/** Gleitzeitsaldo: Startsaldo + Σ(Ist − Soll) ab dem Stichtag bis `to`. Ohne Stichtag ab `fallbackFrom`. */
export function runningBalance(member: ScheduledMember, entries: { user_id: string; work_date: string; minutes: number }[], absences: AbsenceLike[], to: string, fallbackFrom: string, defaultLocation: string | null = null): { minutes: number; since: string } | null {
  const since = member.balance_start_on && member.balance_start_on <= to ? member.balance_start_on : fallbackFrom;
  const account = timeAccount(member, entries, absences, since, to, defaultLocation);
  if (!account) return null;
  return { minutes: (member.balance_start_on && member.balance_start_on <= to ? member.balance_start_minutes ?? 0 : 0) + account.deltaMinutes, since };
}
/** Zählt Urlaubstage nur an Tagen mit Soll > 0 (Teilzeit: freie Wochentage kosten keinen Urlaub). */
export const worksOn = (schedule: WorkSchedule | null | undefined, day: string) => schedule ? schedule[scheduleIndex(day)] > 0 : (weekday(day) >= 1 && weekday(day) <= 5);
