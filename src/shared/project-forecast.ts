import type { ProjectInsight } from './project-insight-types.js';
import {calculateProjectProgress,type AutoProgress} from './project-progress.js';

export type ForecastBlocker = 'invalid-date' | 'invalid-history' | 'inactive' | 'missing-progress' | 'zero-progress' | 'stale-progress' | 'undated-progress' | 'no-effort' | 'insufficient-history' | 'no-pace' | 'out-of-range';
export interface ProjectForecast {
  usedMinutes: number;
  budgetMinutes: number | null;
  budgetRemainingMinutes: number | null;
  budgetStatus: 'none' | 'unknown' | 'within' | 'over';
  progressPercent: number | null;
  progress: AutoProgress;
  progressState: 'missing' | 'not-started' | 'current' | 'stale' | 'complete';
  projectedTotalMinutes: number | null;
  remainingMinutes: number | null;
  observationDays: number;
  loggedDays: number;
  paceMinutesPerDay: number | null;
  predictedFinishDate: string | null;
  deadlineDate: string | null;
  deadlineStatus: 'none' | 'unknown' | 'overdue' | 'within' | 'late' | 'complete';
  blockers: ForecastBlocker[];
}
const DAY = 86_400_000;
/** Work dates have no time zone. Validate before arithmetic to prevent Date rollover. */
function calendarDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / DAY : null;
}
function dateFromDay(day: number): string | null {
  if (!Number.isSafeInteger(day) || day < 10957 || day > 47846) return null;
  return new Date(day * DAY).toISOString().slice(0, 10);
}

/** A constant-pace scenario from the server's all-history, workspace-local snapshot. */
export function forecastProject(insight: ProjectInsight): ProjectForecast {
  const { project } = insight;
  const blockers: ForecastBlocker[] = [];
  const today = calendarDay(insight.as_of);
  const first = calendarDay(insight.first_work_date);
  const last = calendarDay(insight.last_work_date);
  const dueDay = calendarDay(project.due_date);
  const usedMinutes = Number.isFinite(insight.total_minutes) && insight.total_minutes >= 0 ? insight.total_minutes : 0;
  const budgetMinutes = Number.isFinite(project.budget_minutes) && project.budget_minutes > 0 ? project.budget_minutes : null;
  const progress = calculateProjectProgress(insight.tasks);
  const progressPercent = progress.percent;
  if (today === null) blockers.push('invalid-date');
  if (project.status !== 'active') blockers.push('inactive');
  if (progressPercent === null) blockers.push('missing-progress');
  else if (progressPercent === 0) blockers.push('zero-progress');
  if (usedMinutes === 0) blockers.push('no-effort');
  if (usedMinutes !== insight.total_minutes) blockers.push('out-of-range');

  const historyValid = today !== null && first !== null && first <= today && last !== null && last >= first && last <= today;
  if (!historyValid && usedMinutes > 0) blockers.push('invalid-history');
  const observationDays = historyValid ? Math.min(28, today! - first! + 1) : 0;
  const windowStart = historyValid ? Math.max(first!, today! - 27) : null;
  const loggedDates = new Set<string>();
  let recentMinutes = 0;
  if (windowStart !== null) for (const row of insight.recent_daily) {
    const day = calendarDay(row.work_date);
    if (day === null || day < windowStart || day > today! || !Number.isFinite(row.minutes) || row.minutes <= 0) continue;
    loggedDates.add(row.work_date);
    recentMinutes += row.minutes;
  }
  const paceMinutesPerDay = observationDays > 0 && Number.isFinite(recentMinutes) ? recentMinutes / observationDays : null;
  if (observationDays < 7 || loggedDates.size < 3) blockers.push('insufficient-history');
  if (paceMinutesPerDay === null || paceMinutesPerDay <= 0) blockers.push('no-pace');

  let projectedTotalMinutes: number | null = null;
  if (progressPercent === 100) projectedTotalMinutes = usedMinutes;
  else if (progressPercent !== null && progressPercent > 0 && usedMinutes > 0) {
    const projected = usedMinutes / (progressPercent / 100);
    if (Number.isFinite(projected) && projected <= Number.MAX_SAFE_INTEGER) projectedTotalMinutes = projected;
    else blockers.push('out-of-range');
  }
  const remainingMinutes = projectedTotalMinutes === null ? null : Math.max(0, projectedTotalMinutes - usedMinutes);
  let predictedFinishDate: string | null = null;
  if (blockers.length === 0 && progressPercent !== 100 && remainingMinutes !== null && paceMinutesPerDay !== null) {
    predictedFinishDate = dateFromDay(today! + Math.ceil(remainingMinutes / paceMinutesPerDay));
    if (predictedFinishDate === null) blockers.push('out-of-range');
  }
  let deadlineStatus: ProjectForecast['deadlineStatus'] = 'unknown';
  if (!project.due_date) deadlineStatus = 'none';
  else if (today !== null && dueDay !== null) {
    if (progressPercent === 100) deadlineStatus = 'complete';
    else if (dueDay < today) deadlineStatus = 'overdue';
    else if (predictedFinishDate !== null) deadlineStatus = predictedFinishDate <= project.due_date ? 'within' : 'late';
  }
  let budgetStatus: ProjectForecast['budgetStatus'] = 'unknown';
  if (budgetMinutes === null) budgetStatus = 'none';
  else if (usedMinutes > budgetMinutes || (projectedTotalMinutes !== null && projectedTotalMinutes > budgetMinutes)) budgetStatus = 'over';
  else if (projectedTotalMinutes !== null && blockers.length === 0) budgetStatus = 'within';
  return {
    usedMinutes, budgetMinutes, budgetRemainingMinutes: budgetMinutes === null ? null : budgetMinutes - usedMinutes, budgetStatus,
    progress, progressPercent, progressState: progressPercent === null ? 'missing' : progressPercent === 100 ? 'complete' : progressPercent === 0 ? 'not-started' : 'current',
    projectedTotalMinutes, remainingMinutes, observationDays, loggedDays: loggedDates.size, paceMinutesPerDay,
    predictedFinishDate, deadlineDate: dueDay === null ? null : project.due_date!, deadlineStatus, blockers,
  };
}
