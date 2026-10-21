import { describe, it, expect } from 'vitest';
import { countWorkdays, utilization } from '../src/web/helpers';
import type { Membership, TimeEntry } from '../src/shared/types';

const member = (user_id: string, extra: Partial<Membership> = {}): Membership => ({
  workspace_id: 'w', user_id, role: 'member', display_name: user_id, email: `${user_id}@example.test`, created_at: '', ...extra,
});
const entry = (user_id: string, minutes: number, billable = true): TimeEntry => ({
  id: crypto.randomUUID(), workspace_id: 'w', project_id: 'p', user_id, work_date: '2026-10-13', minutes, note: '', billable, status: 'approved', timer_id: null, created_at: '',
});
// 2026-10-05 (Mo) bis 2026-10-16 (Fr): zwei volle Arbeitswochen.
const range = { from: '2026-10-05', to: '2026-10-16' };

describe('workday counting', () => {
  it('counts Monday to Friday inclusively and skips weekends', () => {
    expect(countWorkdays(range.from, range.to)).toBe(10);
    expect(countWorkdays('2026-10-10', '2026-10-11')).toBe(0); // Sa–So
    expect(countWorkdays('2026-10-13', '2026-10-13')).toBe(1);
  });
});

describe('team utilization', () => {
  it('derives target from capacity and deduplicated absence workdays, keeping unknown capacity unknown', () => {
    const members = [
      member('a', { weekly_capacity_minutes: 2400 }), // 40 h
      member('b'), // Kapazität unbekannt
      member('c', { weekly_capacity_minutes: 1200, role: 'disabled' }),
    ];
    const absences = [
      { user_id: 'a', starts_on: '2026-10-08', ends_on: '2026-10-12' }, // Do–Mo = 3 Werktage
      { user_id: 'a', starts_on: '2026-10-12', ends_on: '2026-10-13' }, // überlappt Mo, + Di = 1 neuer Tag
      { user_id: 'a', starts_on: '2026-09-01', ends_on: '2026-09-05' }, // außerhalb
      { user_id: 'b', starts_on: '2026-10-01', ends_on: '2027-01-31' }, // klemmt auf den Zeitraum
    ];
    const report = utilization(members, [entry('a', 300), entry('a', 60, false), entry('b', 120)], absences, range);
    expect(report.get('a')).toEqual({ capacityMinutes: 2400, absenceWorkdays: 4, holidayWorkdays: 0, expectedMinutes: 2880, actualMinutes: 360, billableMinutes: 300 });
    expect(report.get('b')).toEqual({ capacityMinutes: null, absenceWorkdays: 10, holidayWorkdays: 0, expectedMinutes: null, actualMinutes: 120, billableMinutes: 120 });
    expect(report.has('c')).toBe(false);
  });
  it('never reports a negative target when absences exceed the range', () => {
    const report = utilization([member('a', { weekly_capacity_minutes: 2400 })], [], [
      { user_id: 'a', starts_on: '2026-10-01', ends_on: '2026-10-31' },
    ], range);
    expect(report.get('a')!.expectedMinutes).toBe(0);
    expect(report.get('a')!.absenceWorkdays).toBe(10);
  });
  it('subtracts public holidays of the person’s location, falling back to the workspace default, without double-counting absences', () => {
    // 2026-05-11 (Mo) bis 2026-05-29 (Fr): 15 Werktage; Christi Himmelfahrt 14.5. überall, Fronleichnam 4.6. außerhalb.
    const week = { from: '2026-05-11', to: '2026-05-29' };
    const report = utilization([
      member('a', { weekly_capacity_minutes: 2400, location: 'DE-BW' }),
      member('b', { weekly_capacity_minutes: 2400 }), // Workspace-Standard DE-HH
      member('c', { weekly_capacity_minutes: 2400, location: 'DE-BW' }),
    ], [], [{ user_id: 'c', starts_on: '2026-05-14', ends_on: '2026-05-15' }], week, 'DE-HH');
    expect(report.get('a')).toMatchObject({ holidayWorkdays: 2, absenceWorkdays: 0, expectedMinutes: 13 * 480 }); // Himmelfahrt + Pfingstmontag 25.5.
    expect(report.get('b')).toMatchObject({ holidayWorkdays: 2, expectedMinutes: 13 * 480 });
    expect(report.get('c')).toMatchObject({ holidayWorkdays: 1, absenceWorkdays: 2, expectedMinutes: 12 * 480 }); // Himmelfahrt liegt schon in der Abwesenheit
    expect(utilization([member('d', { weekly_capacity_minutes: 2400 })], [], [], week).get('d')).toMatchObject({ holidayWorkdays: 0, expectedMinutes: 15 * 480 });
  });
});
