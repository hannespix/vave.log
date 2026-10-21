import { describe, expect, it } from 'vitest';
import { dayTarget, effectiveSchedule, isSchedule, runningBalance, scheduleTotal, timeAccount, worksOn, type WorkSchedule } from '../src/shared/schedule';
import { absenceWorkdays, vacationSummary } from '../src/shared/vacation';

const fourDays: WorkSchedule = [480, 480, 480, 480, 0, 0, 0];
const entry = (work_date: string, minutes: number, user_id = 'a') => ({ user_id, work_date, minutes });

describe('work schedule', () => {
  it('derives the effective schedule from the model or the weekly capacity', () => {
    expect(effectiveSchedule({ user_id: 'a', work_schedule: fourDays })).toEqual(fourDays);
    expect(effectiveSchedule({ user_id: 'a', weekly_capacity_minutes: 2400 })).toEqual([480, 480, 480, 480, 480, 0, 0]);
    expect(effectiveSchedule({ user_id: 'a', weekly_capacity_minutes: 1500 })).toEqual([300, 300, 300, 300, 300, 0, 0]);
    expect(effectiveSchedule({ user_id: 'a' })).toBeNull();
    expect(effectiveSchedule({ user_id: 'a', work_schedule: [1, 2, 3] })).toBeNull();
    expect(isSchedule([0, 0, 0, 0, 0, 0, 0])).toBe(true);
    expect(isSchedule([480, 480, 480, 480, 480, 480, 1441])).toBe(false);
    expect(scheduleTotal(fourDays)).toBe(1920);
  });
  it('targets 0 on holidays, free weekdays and full absences, half on half days', () => {
    expect(dayTarget(fourDays, '2026-10-12', null, null)).toBe(480); // Montag
    expect(dayTarget(fourDays, '2026-10-16', null, null)).toBe(0); // Freitag frei
    expect(dayTarget(fourDays, '2026-10-12', 'Feiertag', null)).toBe(0);
    expect(dayTarget(fourDays, '2026-10-12', null, { user_id: 'a', starts_on: '2026-10-12', ends_on: '2026-10-12', kind: 'vacation' })).toBe(0);
    expect(dayTarget(fourDays, '2026-10-12', null, { user_id: 'a', starts_on: '2026-10-12', ends_on: '2026-10-12', kind: 'vacation', half_day: 'pm' })).toBe(240);
    expect(dayTarget(null, '2026-10-12', null, null)).toBeNull();
    expect(worksOn(fourDays, '2026-10-16')).toBe(false);
    expect(worksOn(null, '2026-10-16')).toBe(true);
    expect(worksOn(null, '2026-10-17')).toBe(false);
  });
  it('builds the time account for a period and the running balance since the start date', () => {
    const member = { user_id: 'a', work_schedule: fourDays, location: 'DE-BW', balance_start_on: '2026-10-05', balance_start_minutes: 120 };
    const absences = [{ user_id: 'a', starts_on: '2026-10-07', ends_on: '2026-10-07', kind: 'sick' as const, status: 'approved' as const }, { user_id: 'a', starts_on: '2026-10-08', ends_on: '2026-10-08', kind: 'vacation' as const, status: 'requested' as const }];
    const entries = [entry('2026-10-05', 500), entry('2026-10-06', 400), entry('2026-10-08', 480), entry('2026-10-09', 120), entry('2026-10-06', 999, 'b')];
    // Woche 5.–11.10.: Soll Mo 480, Di 480, Mi 0 (krank), Do 480 (Antrag zählt nicht), Fr 0 = 1440; Ist 1500.
    const week = timeAccount(member, entries, absences, '2026-10-05', '2026-10-11')!;
    expect(week.targetMinutes).toBe(1440);
    expect(week.actualMinutes).toBe(1500);
    expect(week.deltaMinutes).toBe(60);
    expect(week.days.map((d) => d.target)).toEqual([480, 480, 0, 480, 0, 0, 0]);
    expect(week.days[2].absence?.kind).toBe('sick');
    expect(timeAccount({ user_id: 'z' }, entries, absences, '2026-10-05', '2026-10-11')).toBeNull();
    // Feiertag: 3.10.2026 ist ein Samstag, 1.1.2027 ein Freitag (frei im Modell) – Weihnachten 25.12. (Fr) frei, 24.12. kein Feiertag.
    expect(timeAccount(member, [], [], '2026-12-21', '2026-12-27')!.targetMinutes).toBe(1920);
    expect(timeAccount(member, [], [], '2026-12-28', '2027-01-03')!.targetMinutes).toBe(1920);
    expect(runningBalance(member, entries, absences, '2026-10-11', '2026-01-01')).toEqual({ minutes: 180, since: '2026-10-05' });
    expect(runningBalance({ ...member, balance_start_on: null }, entries, absences, '2026-10-11', '2026-10-06')).toEqual({ minutes: 1000 - 960, since: '2026-10-06' });
    expect(runningBalance({ ...member, balance_start_on: '2027-01-01' }, entries, absences, '2026-10-11', '2026-10-05')!.minutes).toBe(60);
  });
  it('counts vacation days only on scheduled workdays', () => {
    const a = { user_id: 'a', starts_on: '2026-10-12', ends_on: '2026-10-16', kind: 'vacation' as const, status: 'approved' as const };
    expect(absenceWorkdays(a, null)).toBe(5);
    expect(absenceWorkdays(a, null, undefined, undefined, fourDays)).toBe(4);
    expect(vacationSummary({ entitlement: 24, absences: [a], userId: 'a', year: 2026, location: null, schedule: fourDays }).taken).toBe(4);
  });
});
