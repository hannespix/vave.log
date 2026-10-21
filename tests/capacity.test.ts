import { describe, expect, it } from 'vitest';
import { capacityPlan, loadPercent, mondayOf, remainingMinutes, weeksFrom, type PlannableTask } from '../src/shared/capacity';

const task = (id: string, extra: Partial<PlannableTask> = {}): PlannableTask => ({ id, project_id: 'p', title: id, status: 'todo', assignee_id: 'a', due_date: null, estimated_minutes: null, ...extra });
const today = '2026-10-14'; // Mittwoch

describe('capacity plan', () => {
  it('builds Monday-based weeks and remaining effort', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // Sonntag gehört noch zur Woche
    expect(weeksFrom(today, 2)).toEqual([{ from: '2026-10-12', to: '2026-10-18' }, { from: '2026-10-19', to: '2026-10-25' }]);
    expect(weeksFrom(today, 0)).toHaveLength(1);
    expect(remainingMinutes(task('t', { estimated_minutes: 600 }), 200)).toBe(400);
    expect(remainingMinutes(task('t', { estimated_minutes: 600 }), 900)).toBe(0);
    expect(remainingMinutes(task('t'), 100)).toBeNull();
  });
  it('spreads remaining effort over workdays until the due date and counts unestimated tasks', () => {
    const members = [{ user_id: 'a', work_schedule: [480, 480, 480, 480, 480, 0, 0], location: 'DE-BW' }, { user_id: 'b', weekly_capacity_minutes: null }, { user_id: 'c', weekly_capacity_minutes: 2400, role: 'disabled' }];
    const tasks = [
      task('t1', { estimated_minutes: 1500, due_date: '2026-10-21' }), // Rest 1200 über Mi–Fr (3) + Mo–Mi (3) = 200/Tag
      task('t2', { estimated_minutes: 300, due_date: '2026-10-01' }), // überfällig: alles diese Woche
      task('t3', { estimated_minutes: 480, due_date: null, assignee_id: null }), // nicht zugewiesen, ohne Termin: diese Woche
      task('t4', { due_date: '2026-10-22' }), // ungeschätzt mit Termin in Woche 2
      task('t5', { estimated_minutes: 999, status: 'done' }),
      task('t6', { estimated_minutes: 480, assignee_id: 'c' }), // deaktivierte Person fällt raus
      task('t7', { estimated_minutes: 60, due_date: '2026-10-25' }), // Termin am Sonntag: Werktage Mi 14. – Fr 23.
    ];
    const plan = capacityPlan({ members, tasks, effort: new Map([['t1', 300]]), absences: [{ user_id: 'a', starts_on: '2026-10-19', ends_on: '2026-10-19', kind: 'vacation', status: 'approved' }], today, weeks: 3 });
    const a = plan.rows.find((r) => r.user_id === 'a')!;
    expect(a.cells.map((c) => c.available)).toEqual([2400, 1920, 2400]); // Urlaub am Mo 19.10.
    expect(a.cells[0].planned).toBe(600 + 300 + 23); // t1 600, t2 300, t7 3 von 8 Werktagen (22,5 gerundet)
    expect(a.cells[1].planned).toBe(600 + 38);
    expect(a.cells[2].planned).toBe(0);
    expect(a.cells[0].unestimated).toBe(1); // t4 zählt in der laufenden Woche …
    expect(a.cells[1].unestimated).toBe(1); // … und in der Woche seines Termins
    expect(a.cells[0].tasks.map((s) => s.task_id)).toEqual(['t1', 't2', 't4', 't7']);
    expect(plan.unassigned[0]).toMatchObject({ available: null, planned: 480, tasks: [{ task_id: 't3', minutes: 480 }] });
    expect(plan.rows.find((r) => r.user_id === 'b')!.cells[0].available).toBeNull();
    expect(plan.rows.some((r) => r.user_id === 'c')).toBe(false);
    expect(loadPercent(a.cells[0])).toBe(38);
    expect(loadPercent({ available: 0, planned: 10, unestimated: 0, tasks: [] })).toBe(Infinity);
    expect(loadPercent({ available: 0, planned: 0, unestimated: 0, tasks: [] })).toBe(0);
    expect(loadPercent({ available: null, planned: 0, unestimated: 0, tasks: [] })).toBeNull();
  });
});
