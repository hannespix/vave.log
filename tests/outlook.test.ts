import { describe, expect, it } from 'vitest';
import { capacityOutlook, monthsFrom } from '../src/shared/outlook';

const today = '2026-10-14';
const project = (id: string, extra: Partial<Parameters<typeof capacityOutlook>[0]['projects'][number]> = {}) => ({ id, code: id.toUpperCase(), name: id, color: '#000', status: 'active' as const, budget_minutes: 0, ...extra });

describe('capacity outlook', () => {
  it('builds months from today', () => {
    expect(monthsFrom(today, 3)).toEqual([{ key: '2026-10', from: '2026-10-01', to: '2026-10-31' }, { key: '2026-11', from: '2026-11-01', to: '2026-11-30' }, { key: '2026-12', from: '2026-12-01', to: '2026-12-31' }]);
    expect(monthsFrom('2026-12-05', 2)[1]).toEqual({ key: '2027-01', from: '2027-01-01', to: '2027-01-31' });
  });
  it('compares supply per month with remaining project demand, staffed by plan lines', () => {
    const members = [{ user_id: 'a', work_schedule: [480, 480, 480, 480, 480, 0, 0], location: 'DE-BW' }, { user_id: 'b', weekly_capacity_minutes: 1200 }, { user_id: 'x', role: 'disabled', weekly_capacity_minutes: 2400 }];
    const projects = [
      project('p1', { budget_minutes: 6000, due_date: '2026-11-30' }), // Plan 2400 (a) + 1200 (frei) = 3600 geplant, 600 gebucht → Rest 3000
      project('p2', { budget_minutes: 2400 }), // ohne Plan, ohne Termin: über 3 Monate
      project('p3', { budget_minutes: 999, status: 'archived' }),
      project('p4', { budget_minutes: 100, due_date: '2026-10-01' }), // überfällig: alles heute → Oktober
    ];
    const plans = [{ project_id: 'p1', lines: [{ user_id: 'a', planned_minutes: 2400 }, { user_id: null, planned_minutes: 1200 }] }];
    const out = capacityOutlook({ members, projects, plans, effort: new Map([['p1', 600], ['p4', 20]]), absences: [{ user_id: 'a', starts_on: '2026-12-21', ends_on: '2026-12-31', kind: 'vacation', status: 'approved' }], today, months: 3 });
    expect(out.months.map((m) => m.key)).toEqual(['2026-10', '2026-11', '2026-12']);
    // Angebot a: Oktober 22 Werktage × 480 = 10560; November 21 × 480 = 10080; Dezember: 23 Werktage − 9 Tage Urlaub 21.–31.12. (der Feiertag 25.12. liegt darin, der 26.12. ist Samstag) = 14 × 480 = 6720.
    const a = out.people.find((p) => p.user_id === 'a')!;
    expect(a.supply).toEqual([10560, 10080, 6720]);
    expect(out.people.find((p) => p.user_id === 'b')!.supply[0]).toBe(22 * 240);
    expect(out.people.some((p) => p.user_id === 'x')).toBe(false);
    // p1: Rest 3000, davon 2/3 auf a (2000) und 1/3 unbesetzt (1000), über Werktage 14.10.–30.11. (13 + 21 = 34 Tage).
    const p1 = out.projects.find((p) => p.project_id === 'p1')!;
    expect(p1.remaining).toBe(3000);
    expect(p1.months[0] + p1.months[1]).toBe(3000);
    expect(p1.months[2]).toBe(0);
    expect(a.demand[0] + a.demand[1]).toBe(2000);
    // p2 ohne Plan: 2400 über 67 Werktage 14.10.–14.1. (35,8/Tag) → Okt 466, Nov 752, Dez 824; der Januar-Anteil verfällt außerhalb des Horizonts.
    const p2 = out.projects.find((p) => p.project_id === 'p2')!;
    expect(p2.months).toEqual([466, 752, 824]);
    // Unbesetzt = freie Planzeile von p1 (1000) + p2 ohne Plan + p4 ohne Plan (80).
    expect(out.unstaffed[0] + out.unstaffed[1]).toBe(1000 + 466 + 752 + 80);
    expect(out.projects.find((p) => p.project_id === 'p4')!.months).toEqual([80, 0, 0]);
    expect(out.projects.some((p) => p.project_id === 'p3')).toBe(false);
    expect(out.demand[0]).toBe(p1.months[0] + p2.months[0] + 80);
    expect(out.extra).toEqual([0, 0, 0]);
  });
  it('applies scenarios without touching the base data', () => {
    const members = [{ user_id: 'a', weekly_capacity_minutes: 2400 }, { user_id: 'b', weekly_capacity_minutes: 2400 }];
    const base = capacityOutlook({ members, projects: [], plans: [], effort: new Map(), absences: [], today, months: 2 });
    const what = capacityOutlook({ members, projects: [], plans: [], effort: new Map(), absences: [], today, months: 2, scenario: { projects: [{ id: 's1', name: 'Pitch', minutes: 1000, from: '2026-11-02', to: '2026-11-13', user_id: 'b' }], pausedUsers: ['a'], extraWeeklyMinutes: 600 } });
    expect(base.supply[0]).toBe(2 * 22 * 480);
    expect(what.supply[0]).toBe(22 * 480); // a pausiert
    expect(what.extra).toEqual([Math.round(600 / 5 * 22), Math.round(600 / 5 * 21)]);
    expect(what.projects).toEqual([{ project_id: 's1', name: 'Pitch', code: '', color: '#a5ad98', scenario: true, months: [0, 1000], remaining: 1000 }]);
    expect(what.people.find((p) => p.user_id === 'b')!.demand).toEqual([0, 1000]);
    expect(what.unstaffed).toEqual([0, 0]);
  });
});
