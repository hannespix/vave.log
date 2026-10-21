import { holidaysBetween, shiftDate } from './holidays.js';
import { dayTarget, effectiveSchedule, type ScheduledMember } from './schedule.js';
import { absenceStatus, type AbsenceLike } from './vacation.js';

/**
 * Kurzfrist-Kapazität, rein gerechnet: je Person und Woche die verfügbaren
 * Minuten (Arbeitszeitmodell − Feiertage − genehmigte Abwesenheiten) gegen die
 * geplante Last = Restaufwand der zugewiesenen offenen Aufgaben (Schätzung −
 * gebucht, mindestens 0), gleichmäßig über die Werktage bis zum Termin verteilt.
 * Ohne Termin oder mit Termin in der Vergangenheit liegt alles in der laufenden
 * Woche. Aufgaben ohne Schätzung werden gezählt, nie als 0 geplant.
 */
export interface PlannableTask { id: string; project_id: string; title: string; status: 'todo' | 'doing' | 'done'; assignee_id: string | null; due_date: string | null; estimated_minutes?: number | null }
export interface CapacityWeek { from: string; to: string }
export interface CapacityShare { task_id: string; minutes: number }
export interface CapacityCell { available: number | null; planned: number; unestimated: number; tasks: CapacityShare[] }
export interface CapacityRow { user_id: string; cells: CapacityCell[] }
export interface CapacityPlan { weeks: CapacityWeek[]; rows: CapacityRow[]; unassigned: CapacityCell[] }

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const isWorkday = (day: string) => { const d = weekday(day); return d >= 1 && d <= 5; };
/** Montag der Woche, in der `day` liegt. */
export const mondayOf = (day: string) => shiftDate(day, -((weekday(day) + 6) % 7));
/** `count` Wochen ab der Woche von `today` (Mo–So). */
export function weeksFrom(today: string, count: number): CapacityWeek[] {
  const start = mondayOf(today);
  return Array.from({ length: Math.max(1, Math.min(26, count)) }, (_, i) => ({ from: shiftDate(start, i * 7), to: shiftDate(start, i * 7 + 6) }));
}
/** Restaufwand einer Aufgabe; null ohne Schätzung. */
export function remainingMinutes(task: PlannableTask, booked: number): number | null {
  if (task.estimated_minutes == null || task.estimated_minutes <= 0) return null;
  return Math.max(0, task.estimated_minutes - booked);
}
const emptyCell = (available: number | null): CapacityCell => ({ available, planned: 0, unestimated: 0, tasks: [] });

/** Verteilt `minutes` auf die Werktage zwischen `start` und `end` (beide inklusive) und summiert je Woche. */
function spread(minutes: number, start: string, end: string, weeks: CapacityWeek[]): number[] {
  const last = end < start ? start : end;
  const days: string[] = [];
  for (let day = start; day <= last; day = shiftDate(day, 1)) if (isWorkday(day)) days.push(day);
  if (!days.length) days.push(start); // Termin am Wochenende: alles auf diesen Tag
  const perDay = minutes / days.length;
  return weeks.map((w) => Math.round(days.filter((d) => d >= w.from && d <= w.to).length * perDay));
}

export function capacityPlan(input: { members: (ScheduledMember & { role?: string })[]; tasks: PlannableTask[]; effort: Map<string, number>; absences: AbsenceLike[]; today: string; weeks: number; defaultLocation?: string | null }): CapacityPlan {
  const weeks = weeksFrom(input.today, input.weeks);
  const horizonFrom = weeks[0].from, horizonTo = weeks[weeks.length - 1].to;
  const rows: CapacityRow[] = input.members.filter((m) => m.role !== 'disabled').map((m) => {
    const schedule = effectiveSchedule(m);
    const holidays = holidaysBetween(m.location ?? input.defaultLocation ?? null, horizonFrom, horizonTo);
    const own = input.absences.filter((a) => a.user_id === m.user_id && absenceStatus(a) === 'approved');
    return { user_id: m.user_id, cells: weeks.map((w) => {
      if (!schedule) return emptyCell(null);
      let available = 0;
      for (let day = w.from; day <= w.to; day = shiftDate(day, 1)) available += dayTarget(schedule, day, holidays.get(day), own.find((a) => a.starts_on <= day && a.ends_on >= day) ?? null) ?? 0;
      return emptyCell(available);
    }) };
  });
  const unassigned = weeks.map(() => emptyCell(null));
  const start = input.today > horizonFrom ? input.today : horizonFrom;
  for (const task of input.tasks) {
    if (task.status === 'done') continue;
    const target = task.assignee_id ? rows.find((r) => r.user_id === task.assignee_id)?.cells : unassigned;
    if (!target) continue; // deaktivierte oder fremde Person
    const remaining = remainingMinutes(task, input.effort.get(task.id) ?? 0);
    const end = task.due_date && task.due_date > start ? task.due_date : start;
    const shares = remaining == null ? weeks.map(() => 0) : spread(remaining, start, end, weeks);
    shares.forEach((minutes, i) => {
      const cell = target[i];
      if (remaining == null) { if (i === 0 || (task.due_date && task.due_date >= weeks[i].from && task.due_date <= weeks[i].to)) { cell.unestimated++; cell.tasks.push({ task_id: task.id, minutes: 0 }); } return; }
      if (minutes > 0) { cell.planned += minutes; cell.tasks.push({ task_id: task.id, minutes }); }
    });
  }
  return { weeks, rows, unassigned };
}
/** Auslastung einer Zelle in Prozent; null ohne bekannte Kapazität. */
export const loadPercent = (cell: CapacityCell) => cell.available == null ? null : cell.available === 0 ? (cell.planned > 0 ? Infinity : 0) : Math.round(cell.planned / cell.available * 100);
