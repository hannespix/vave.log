import { describe, expect, it } from 'vitest';
import { absenceWorkdays, absencesIcs, absentPerDay, monthDays, overlapCount, vacationSummary, type AbsenceLike } from '../src/shared/vacation';

const absence = (user_id: string, starts_on: string, ends_on: string, extra: Partial<AbsenceLike> = {}): AbsenceLike => ({ user_id, starts_on, ends_on, kind: 'vacation', status: 'approved', ...extra });

describe('vacation arithmetic', () => {
  it('counts workdays minus public holidays and halves single days', () => {
    // Mo 11.5. – Fr 15.5.2026 in BW: Christi Himmelfahrt am Do 14.5.
    expect(absenceWorkdays(absence('a', '2026-05-11', '2026-05-15'), 'DE-BW')).toBe(4);
    expect(absenceWorkdays(absence('a', '2026-05-11', '2026-05-15'), null)).toBe(5);
    expect(absenceWorkdays(absence('a', '2026-05-16', '2026-05-17'), 'DE-BW')).toBe(0); // Wochenende
    expect(absenceWorkdays(absence('a', '2026-05-12', '2026-05-12', { half_day: 'am' }), 'DE-BW')).toBe(0.5);
    expect(absenceWorkdays(absence('a', '2026-05-14', '2026-05-14', { half_day: 'pm' }), 'DE-BW')).toBe(0); // halber Feiertag zählt nichts
    expect(absenceWorkdays(absence('a', '2026-12-28', '2027-01-08'), 'DE-BW', '2027-01-01', '2027-12-31')).toBe(4); // nur der Teil im Fenster: 4., 5., 7., 8.1. (1.1. und 6.1. frei)
  });
  it('summarises the yearly account with carry-over, adjustment, taken and requested days', () => {
    const absences = [
      absence('a', '2026-03-02', '2026-03-06'), // 5
      absence('a', '2026-05-11', '2026-05-15'), // 4 (Himmelfahrt)
      absence('a', '2026-08-03', '2026-08-04', { status: 'requested' }), // 2 beantragt
      absence('a', '2026-09-01', '2026-09-01', { status: 'declined' }),
      absence('a', '2026-10-05', '2026-10-05', { kind: 'sick' }),
      absence('b', '2026-03-02', '2026-03-06'),
      absence('a', '2025-12-29', '2026-01-02'), // 1 Tag im neuen Jahr (1.1. frei, 2.1. Freitag)
    ];
    expect(vacationSummary({ entitlement: 30, carriedOver: 3, adjustment: -1, absences, userId: 'a', year: 2026, location: 'DE-BW' }))
      .toEqual({ entitlement: 30, carriedOver: 3, adjustment: -1, taken: 10, requested: 2, remaining: 20 });
    expect(vacationSummary({ entitlement: null, absences, userId: 'a', year: 2026, location: 'DE-BW' }).remaining).toBeNull();
    expect(vacationSummary({ entitlement: 20, absences: [], userId: 'z', year: 2026, location: null }).remaining).toBe(20);
  });
  it('lists who is away per day and how many others overlap a request', () => {
    const team = [absence('a', '2026-07-06', '2026-07-10'), absence('b', '2026-07-08', '2026-07-14', { status: 'requested' }), absence('c', '2026-07-09', '2026-07-09', { status: 'declined' })];
    const perDay = absentPerDay(team, '2026-07-01', '2026-07-31');
    expect([...perDay.get('2026-07-08')!]).toEqual(['a', 'b']);
    expect(perDay.has('2026-07-09')).toBe(true);
    expect(perDay.get('2026-07-09')!.has('c')).toBe(false);
    expect(overlapCount(absence('d', '2026-07-09', '2026-07-10'), team)).toBe(2);
    expect(overlapCount(absence('d', '2026-07-20', '2026-07-21'), team)).toBe(0);
    expect(overlapCount(absence('a', '2026-07-06', '2026-07-07'), team)).toBe(0); // eigene zählt nicht
  });
  it('builds month grids and an iCalendar file with exclusive end dates', () => {
    expect(monthDays(2026, 2)).toHaveLength(28);
    expect(monthDays(2028, 2)).toHaveLength(29);
    expect(monthDays(2026, 10)[30]).toBe('2026-10-31');
    const ics = absencesIcs([absence('a', '2026-07-06', '2026-07-10'), absence('b', '2026-07-08', '2026-07-08', { status: 'requested' })], (id) => ({ a: 'Lena, Müller' } as Record<string, string>)[id] ?? id, { vacation: 'Urlaub', sick: 'Krank', holiday: 'Feiertag', other: 'Sonstiges' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260706');
    expect(ics).toContain('DTEND;VALUE=DATE:20260711');
    expect(ics).toContain('SUMMARY:Lena\\, Müller – Urlaub');
    expect(ics).not.toContain('20260708');
  });
});

describe('Audit 16.11.2026: vacation is counted per day', () => {
  const account = (absences: AbsenceLike[]) => vacationSummary({ entitlement: 30, absences, userId: 'a', year: 2027, location: null });
  it('does not count sick days inside a vacation as vacation', () => {
    // Mo 7.6. – Fr 11.6.2027 Urlaub, Mi/Do krank: drei Urlaubstage.
    expect(account([absence('a', '2027-06-07', '2027-06-11'), absence('a', '2027-06-09', '2027-06-10', { kind: 'sick' })])).toMatchObject({ taken: 3, remaining: 27 });
    // Abgelehnte Krankmeldung ändert nichts, die einer anderen Person auch nicht.
    expect(account([absence('a', '2027-06-07', '2027-06-11'), absence('a', '2027-06-09', '2027-06-10', { kind: 'sick', status: 'declined' }), absence('b', '2027-06-07', '2027-06-11', { kind: 'sick' })]).taken).toBe(5);
  });
  it('never counts a day twice when older entries overlap', () => {
    expect(account([absence('a', '2027-06-07', '2027-06-11'), absence('a', '2027-06-10', '2027-06-15')]).taken).toBe(7);
    expect(account([absence('a', '2027-06-07', '2027-06-08'), absence('a', '2027-06-08', '2027-06-09', { status: 'requested' })])).toMatchObject({ taken: 2, requested: 1 });
    expect(account([absence('a', '2027-07-01', '2027-07-01', { half_day: 'am' }), absence('a', '2027-07-01', '2027-07-01', { half_day: 'pm' })]).taken).toBe(1);
  });
  it('keeps two half days on one date apart in the calendar export', () => {
    const ics = absencesIcs([absence('a', '2027-07-01', '2027-07-01', { half_day: 'am' }), absence('a', '2027-07-01', '2027-07-01', { half_day: 'pm', kind: 'other' })], () => 'A', { vacation: 'Urlaub', sick: 'Krank', holiday: 'Feiertag', other: 'Sonstiges' });
    const uids = ics.split('\r\n').filter((l) => l.startsWith('UID:'));
    expect(new Set(uids).size).toBe(2);
  });
});
