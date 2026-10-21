import { calculateProjectProgress, taskProgressStats } from './project-progress.js';
import { shiftDate } from './holidays.js';

/**
 * Lagebild „Wo brennt es“: ein erklärbarer Gesundheitswert je Projekt aus
 * einzelnen Signalen mit Gewicht und Begründung – keine Blackbox. Jedes Signal
 * nennt, was es gemessen hat; die Ampel folgt aus der Summe. Rein gerechnet,
 * damit Oberfläche, MCP und Tests dieselbe Einschätzung liefern.
 */
export type HealthLevel = 'green' | 'yellow' | 'red';
export type HealthSignalKind = 'project-overdue' | 'deadline-near' | 'milestone-overdue' | 'tasks-overdue' | 'budget-over' | 'budget-ahead' | 'stale' | 'unassigned-soon' | 'unestimated' | 'overloaded';
export interface HealthSignal { kind: HealthSignalKind; weight: number; value: number; detail: string | null }
export interface HealthProject { id: string; code: string; name: string; client: string; color: string; status: 'active' | 'paused' | 'archived'; budget_minutes: number; due_date?: string | null }
export interface HealthTask { id: string; project_id: string; title: string; status: 'todo' | 'doing' | 'done'; assignee_id: string | null; due_date: string | null; estimated_minutes?: number | null; is_milestone?: boolean }
export interface HealthEffort { minutes: number; last_work_date: string | null }
export interface ProjectHealth { project_id: string; level: HealthLevel; score: number; signals: HealthSignal[]; progressPercent: number | null; bookedMinutes: number; openTasks: number; overdueTasks: number }
export interface HealthOptions { today: string; overloadedUsers?: Set<string>; includeBudget?: boolean; soonDays?: number; staleDays?: number }

export const HEALTH_WEIGHTS: Record<HealthSignalKind, number> = { 'project-overdue': 4, 'deadline-near': 2, 'milestone-overdue': 3, 'tasks-overdue': 2, 'budget-over': 3, 'budget-ahead': 2, stale: 2, 'unassigned-soon': 1, unestimated: 1, overloaded: 2 };
export const levelFor = (score: number): HealthLevel => score >= 6 ? 'red' : score >= 3 ? 'yellow' : 'green';

export function projectHealth(project: HealthProject, tasks: HealthTask[], effort: HealthEffort | undefined, options: HealthOptions): ProjectHealth {
  const today = options.today, soon = shiftDate(today, options.soonDays ?? 14), staleBefore = shiftDate(today, -(options.staleDays ?? 14));
  const own = tasks.filter((t) => t.project_id === project.id);
  const open = own.filter((t) => t.status !== 'done');
  const progress = calculateProjectProgress(taskProgressStats(own));
  const booked = effort?.minutes ?? 0;
  const signals: HealthSignal[] = [];
  const add = (kind: HealthSignalKind, value: number, detail: string | null = null, scale = 1) => { if (value > 0) signals.push({ kind, weight: Math.min(HEALTH_WEIGHTS[kind] * scale, HEALTH_WEIGHTS[kind] * 2), value, detail }); };
  if (project.status === 'active') {
    const done = progress.percent === 100 || (own.length > 0 && open.length === 0);
    if (project.due_date && !done) {
      if (project.due_date < today) add('project-overdue', 1, project.due_date);
      else if (project.due_date <= soon && (progress.percent ?? 0) < 70) add('deadline-near', 1, project.due_date);
    }
    const milestones = open.filter((t) => t.is_milestone && t.due_date && t.due_date < today);
    add('milestone-overdue', milestones.length, milestones[0]?.title ?? null);
    const overdue = open.filter((t) => !t.is_milestone && t.due_date && t.due_date < today);
    add('tasks-overdue', overdue.length, overdue[0]?.title ?? null, overdue.length >= 3 ? 2 : 1);
    if (options.includeBudget !== false && project.budget_minutes > 0) {
      const burn = booked / project.budget_minutes;
      if (burn > 1.1) add('budget-over', Math.round(burn * 100), null);
      else if (burn > 0.9 && (progress.percent ?? 0) < 80) add('budget-ahead', Math.round(burn * 100), progress.percent == null ? null : String(progress.percent));
    }
    if (open.length > 0 && effort?.last_work_date && effort.last_work_date < staleBefore) add('stale', 1, effort.last_work_date);
    const unassigned = open.filter((t) => !t.assignee_id && t.due_date && t.due_date <= soon);
    add('unassigned-soon', unassigned.length, unassigned[0]?.title ?? null, unassigned.length >= 2 ? 2 : 1);
    const unestimated = open.filter((t) => !t.estimated_minutes);
    if (unestimated.length >= 3) add('unestimated', unestimated.length, null);
    if (options.overloadedUsers?.size) {
      const overloaded = new Set(open.filter((t) => t.assignee_id && options.overloadedUsers!.has(t.assignee_id)).map((t) => t.assignee_id!));
      add('overloaded', overloaded.size, null);
    }
  }
  const score = signals.reduce((s, x) => s + x.weight, 0);
  return { project_id: project.id, level: levelFor(score), score, signals, progressPercent: progress.percent, bookedMinutes: booked, openTasks: open.length, overdueTasks: open.filter((t) => t.due_date && t.due_date < today).length };
}
/** Lagebild über alle aktiven Projekte, rot zuerst, dann nach Punkten und Name. */
export function portfolioHealth(projects: HealthProject[], tasks: HealthTask[], effort: Map<string, HealthEffort>, options: HealthOptions): ProjectHealth[] {
  const order: Record<HealthLevel, number> = { red: 0, yellow: 1, green: 2 };
  return projects.filter((p) => p.status === 'active').map((p) => projectHealth(p, tasks, effort.get(p.id), options))
    .sort((a, b) => order[a.level] - order[b.level] || b.score - a.score || (projects.find((p) => p.id === a.project_id)?.name ?? '').localeCompare(projects.find((p) => p.id === b.project_id)?.name ?? ''));
}
