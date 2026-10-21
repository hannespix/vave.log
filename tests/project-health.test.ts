import { describe, expect, it } from 'vitest';
import { levelFor, portfolioHealth, projectHealth, type HealthProject, type HealthTask } from '../src/shared/project-health';

const today = '2026-10-14';
const project = (id: string, extra: Partial<HealthProject> = {}): HealthProject => ({ id, code: id.toUpperCase(), name: id, client: '', color: '#000', status: 'active', budget_minutes: 0, ...extra });
const task = (id: string, project_id: string, extra: Partial<HealthTask> = {}): HealthTask => ({ id, project_id, title: id, status: 'todo', assignee_id: 'a', due_date: null, ...extra });
const kinds = (h: ReturnType<typeof projectHealth>) => h.signals.map((s) => s.kind);

describe('project health', () => {
  it('is green without signals and maps scores to levels', () => {
    const h = projectHealth(project('p'), [task('t', 'p', { due_date: '2026-12-01', estimated_minutes: 60 })], { minutes: 100, last_work_date: '2026-10-13' }, { today });
    expect(h).toMatchObject({ level: 'green', score: 0, signals: [], openTasks: 1, overdueTasks: 0, bookedMinutes: 100 });
    expect(levelFor(2)).toBe('green'); expect(levelFor(3)).toBe('yellow'); expect(levelFor(6)).toBe('red');
  });
  it('explains deadline, milestone, overdue-task and budget signals', () => {
    const tasks = [
      task('m1', 'p', { is_milestone: true, due_date: '2026-10-01', estimated_minutes: 60 }),
      task('t1', 'p', { due_date: '2026-10-10', estimated_minutes: 60 }), task('t2', 'p', { due_date: '2026-10-11', estimated_minutes: 60 }), task('t3', 'p', { due_date: '2026-10-12', estimated_minutes: 60 }),
      task('d', 'p', { status: 'done', estimated_minutes: 100 }),
    ];
    const h = projectHealth(project('p', { budget_minutes: 1000, due_date: '2026-10-05' }), tasks, { minutes: 1200, last_work_date: '2026-10-13' }, { today });
    expect(kinds(h)).toEqual(['project-overdue', 'milestone-overdue', 'tasks-overdue', 'budget-over']);
    expect(h.signals.find((s) => s.kind === 'tasks-overdue')).toMatchObject({ value: 3, weight: 4, detail: 't1' }); // ab drei überfälligen doppelt
    expect(h.signals.find((s) => s.kind === 'budget-over')).toMatchObject({ value: 120 });
    expect(h.level).toBe('red');
    expect(h.overdueTasks).toBe(4);
  });
  it('warns early: deadline near with low progress, budget nearly used, stale work, unassigned and unestimated tasks, overloaded people', () => {
    const tasks = [task('t1', 'p', { due_date: '2026-10-20', assignee_id: null }), task('t2', 'p', { due_date: '2026-10-21', assignee_id: null }), task('t3', 'p', { assignee_id: 'b' }), task('t4', 'p'), task('d', 'p', { status: 'done' })];
    const h = projectHealth(project('p', { budget_minutes: 1000, due_date: '2026-10-25' }), tasks, { minutes: 950, last_work_date: '2026-09-20' }, { today, overloadedUsers: new Set(['b']) });
    expect(kinds(h)).toEqual(['deadline-near', 'budget-ahead', 'stale', 'unassigned-soon', 'unestimated', 'overloaded']);
    expect(h.signals.find((s) => s.kind === 'unassigned-soon')).toMatchObject({ value: 2, weight: 2 });
    expect(h.signals.find((s) => s.kind === 'budget-ahead')).toMatchObject({ value: 95, detail: '20' });
    expect(h.level).toBe('red');
    // Ohne Budgetsignale (Mitgliedersicht) bleibt die Einschätzung erklärbar.
    expect(kinds(projectHealth(project('p', { budget_minutes: 1000, due_date: '2026-10-25' }), tasks, { minutes: 950, last_work_date: '2026-09-20' }, { today, includeBudget: false }))).not.toContain('budget-ahead');
  });
  it('ignores finished and inactive projects and sorts the portfolio red first', () => {
    const projects = [project('calm'), project('late', { due_date: '2026-10-01' }), project('paused', { status: 'paused', due_date: '2026-01-01' }), project('done', { due_date: '2026-10-01' })];
    const tasks = [task('x', 'late'), task('y', 'calm', { due_date: '2026-12-01', estimated_minutes: 30 }), task('z', 'done', { status: 'done' })];
    const list = portfolioHealth(projects, tasks, new Map(), { today });
    expect(list.map((h) => h.project_id)).toEqual(['late', 'calm', 'done']);
    expect(list[0].level).toBe('yellow');
    expect(list.find((h) => h.project_id === 'done')!.signals).toEqual([]); // alle Aufgaben erledigt: kein Terminsignal
    expect(list.some((h) => h.project_id === 'paused')).toBe(false);
  });
});
