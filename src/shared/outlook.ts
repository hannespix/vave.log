import { holidaysBetween, shiftDate } from './holidays.js';
import { dayTarget, effectiveSchedule, type ScheduledMember } from './schedule.js';
import { absenceStatus, type AbsenceLike } from './vacation.js';

/**
 * Langfrist-Kapazität (Quartal bis Jahr), rein gerechnet: je Monat das Angebot
 * des Teams (Arbeitszeitmodelle − Feiertage − genehmigte Abwesenheiten) gegen den
 * Bedarf der Projekte. Bedarf = geplanter Aufwand (Finanzplanung je Person, sonst
 * Zeitbudget) minus bisher gebuchter Zeit, gleichmäßig über die Werktage von heute
 * bis zum Projekttermin verteilt; ohne Termin über die nächsten drei Monate.
 * Szenarien (zusätzliches Projekt, pausierte Person, Freelancer-Stunden) werden
 * als Eingaben mitgegeben und nie gespeichert.
 */
export interface OutlookProject { id: string; code: string; name: string; color: string; status: 'active' | 'paused' | 'archived'; budget_minutes: number; due_date?: string | null }
export interface OutlookPlanLine { user_id: string | null; planned_minutes: number }
export interface OutlookPlan { project_id: string; lines: OutlookPlanLine[] }
export interface ScenarioProject { id: string; name: string; minutes: number; from: string; to: string; user_id: string | null }
export interface OutlookScenario { projects: ScenarioProject[]; pausedUsers: string[]; extraWeeklyMinutes: number }
export interface OutlookMonth { key: string; from: string; to: string }
export interface OutlookDemand { project_id: string; name: string; code: string; color: string; scenario: boolean; months: number[]; remaining: number }
export interface OutlookPersonRow { user_id: string; supply: number[]; demand: number[] }
export interface Outlook { months: OutlookMonth[]; supply: number[]; extra: number[]; demand: number[]; unstaffed: number[]; projects: OutlookDemand[]; people: OutlookPersonRow[] }

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const isWorkday = (day: string) => { const d = weekday(day); return d >= 1 && d <= 5; };
export const monthKey = (day: string) => day.slice(0, 7);
/** `count` Monate ab dem Monat von `today`. */
export function monthsFrom(today: string, count: number): OutlookMonth[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: Math.max(1, Math.min(24, count)) }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const from = d.toISOString().slice(0, 10), to = last.toISOString().slice(0, 10);
    return { key: from.slice(0, 7), from, to };
  });
}
/** Verteilt Minuten gleichmäßig über die Werktage [start, end] und summiert je Monat (Teile außerhalb des Horizonts verfallen). */
function spread(minutes: number, start: string, end: string, months: OutlookMonth[]): number[] {
  const last = end < start ? start : end;
  const days: string[] = [];
  for (let day = start; day <= last; day = shiftDate(day, 1)) if (isWorkday(day)) days.push(day);
  if (!days.length) days.push(start);
  const perDay = minutes / days.length;
  return months.map((mo) => Math.round(days.filter((d) => d >= mo.from && d <= mo.to).length * perDay));
}
const addMonths = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };

export function capacityOutlook(input: { members: (ScheduledMember & { role?: string })[]; projects: OutlookProject[]; plans: OutlookPlan[]; effort: Map<string, number>; absences: AbsenceLike[]; today: string; months: number; defaultLocation?: string | null; scenario?: Partial<OutlookScenario> }): Outlook {
  const months = monthsFrom(input.today, input.months);
  const scenario: OutlookScenario = { projects: [], pausedUsers: [], extraWeeklyMinutes: 0, ...input.scenario };
  const horizonFrom = months[0].from, horizonTo = months[months.length - 1].to;
  const zero = () => months.map(() => 0);
  // Angebot je Person und Monat.
  const people: OutlookPersonRow[] = input.members.filter((m) => m.role !== 'disabled').map((m) => {
    const schedule = effectiveSchedule(m);
    const supply = zero();
    if (schedule && !scenario.pausedUsers.includes(m.user_id)) {
      const holidays = holidaysBetween(m.location ?? input.defaultLocation ?? null, horizonFrom, horizonTo);
      const own = input.absences.filter((a) => a.user_id === m.user_id && absenceStatus(a) === 'approved');
      months.forEach((mo, i) => { for (let day = mo.from; day <= mo.to; day = shiftDate(day, 1)) supply[i] += dayTarget(schedule, day, holidays.get(day), own.find((a) => a.starts_on <= day && a.ends_on >= day) ?? null) ?? 0; });
    }
    return { user_id: m.user_id, supply, demand: zero() };
  });
  const start = input.today > horizonFrom ? input.today : horizonFrom;
  const unstaffed = zero();
  const projects: OutlookDemand[] = [];
  const assign = (userId: string | null, shares: number[]) => { const row = userId ? people.find((p) => p.user_id === userId) : undefined; shares.forEach((v, i) => { if (row) row.demand[i] += v; else unstaffed[i] += v; }); };
  for (const p of input.projects) {
    if (p.status !== 'active') continue;
    const plan = input.plans.find((x) => x.project_id === p.id);
    const planned = plan && plan.lines.length ? plan.lines.reduce((s, l) => s + l.planned_minutes, 0) : p.budget_minutes;
    const booked = input.effort.get(p.id) ?? 0;
    const remaining = Math.max(0, planned - booked);
    const end = p.due_date && p.due_date > start ? p.due_date : (p.due_date ? start : addMonths(start, 3));
    const total = zero();
    if (remaining > 0) {
      if (plan && plan.lines.length) {
        // Anteilig je Planzeile: jede Zeile trägt ihren Anteil am Restaufwand.
        for (const line of plan.lines) {
          const share = Math.round(remaining * (line.planned_minutes / planned));
          if (share <= 0) continue;
          const shares = spread(share, start, end, months);
          assign(line.user_id, shares);
          shares.forEach((v, i) => { total[i] += v; });
        }
      } else {
        const shares = spread(remaining, start, end, months);
        assign(null, shares);
        shares.forEach((v, i) => { total[i] += v; });
      }
    }
    projects.push({ project_id: p.id, name: p.name, code: p.code, color: p.color, scenario: false, months: total, remaining });
  }
  for (const s of scenario.projects) {
    if (s.minutes <= 0) continue;
    const shares = spread(s.minutes, s.from > start ? s.from : start, s.to, months);
    assign(s.user_id, shares);
    projects.push({ project_id: s.id, name: s.name, code: '', color: '#a5ad98', scenario: true, months: shares, remaining: s.minutes });
  }
  const supply = months.map((_, i) => people.reduce((s, p) => s + p.supply[i], 0));
  // Freelancer-Stunden je Woche: über die Werktage des Monats verteilt (5 Werktage je Woche).
  const extra = months.map((mo) => { let days = 0; for (let day = mo.from; day <= mo.to; day = shiftDate(day, 1)) if (isWorkday(day)) days++; return Math.round(scenario.extraWeeklyMinutes / 5 * days); });
  const demand = months.map((_, i) => projects.reduce((s, p) => s + p.months[i], 0));
  return { months, supply, extra, demand, unstaffed, projects, people };
}
