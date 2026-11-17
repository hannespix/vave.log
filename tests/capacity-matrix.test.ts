import { describe, expect, it } from 'vitest';
import { capacityMatrix, freeLevel, hoursText, matrixWeeks, parseHours, phaseForDay, serviceTypeForPerson, type MatrixInput } from '../src/shared/capacity-matrix';

const FULL = [480, 480, 480, 480, 480, 0, 0], PART = [480, 480, 480, 0, 0, 0, 0];
const base = (extra: Partial<MatrixInput> = {}): MatrixInput => ({
  members: [{ user_id: 'ana', work_schedule: FULL, location: 'DE-HE' }, { user_id: 'ben', work_schedule: PART }, { user_id: 'cle' }, { user_id: 'gone', work_schedule: FULL, role: 'disabled' }],
  rows: [
    { id: 'r1', project_id: 'p1', user_id: 'ana', service_type_id: 'pm', offered_minutes: 4800, note: '', position: 1 },
    { id: 'r2', project_id: 'p1', user_id: 'ben', service_type_id: '3d', offered_minutes: null, note: '', position: 2 },
    { id: 'r3', project_id: 'p1', user_id: null, service_type_id: '3d', offered_minutes: null, note: 'XYZ', position: 3 },
    { id: 'r4', project_id: 'p2', user_id: 'ana', service_type_id: 'cd', offered_minutes: 600, note: '', position: 1 },
    { id: 'r5', project_id: 'p2', user_id: 'ana', service_type_id: 'pm', offered_minutes: null, note: '', position: 2 },
  ],
  phases: [
    { id: 'ph1', project_id: 'p1', name: 'Konzept', position: 1, starts_on: '2026-11-09', ends_on: '2026-11-22', budget_minutes: 6000 },
    { id: 'ph2', project_id: 'p1', name: 'Entwurf', position: 2, starts_on: '2026-11-23', ends_on: '2027-02-28', budget_minutes: 0 },
    { id: 'ph3', project_id: 'p1', name: 'Nachlauf', position: 3, starts_on: null, ends_on: null, budget_minutes: 0 },
  ],
  cells: [
    { row_id: 'r1', week_start: '2026-11-16', minutes: 1200 }, { row_id: 'r1', week_start: '2026-11-23', minutes: 1200 },
    { row_id: 'r2', week_start: '2026-11-16', minutes: 1500 }, { row_id: 'r3', week_start: '2026-11-23', minutes: 960 },
    { row_id: 'r4', week_start: '2026-11-16', minutes: 900 }, { row_id: 'r5', week_start: '2026-11-16', minutes: 600 },
    { row_id: 'r1', week_start: '2027-03-01', minutes: 999 }, // außerhalb des Ausschnitts
  ],
  actuals: [{ project_id: 'p1', user_id: 'ana', week_start: '2026-11-16', minutes: 300 }, { project_id: 'p2', user_id: 'ana', week_start: '2026-11-16', minutes: 120 }, { project_id: 'p1', user_id: 'zoe', week_start: '2026-11-16', minutes: 60 }],
  absences: [{ user_id: 'ana', starts_on: '2026-11-26', ends_on: '2026-11-27', kind: 'vacation', status: 'approved' }, { user_id: 'ben', starts_on: '2026-11-16', ends_on: '2026-11-20', kind: 'vacation', status: 'requested' }],
  from: '2026-11-18', weeks: 3, today: '2026-11-17', outside: new Map([['r1', 999]]), ...extra,
});

describe('Kapazitätsmatrix', () => {
  it('legt Kalenderwochen ab dem Montag an und kennt Monat und laufende Woche', () => {
    expect(matrixWeeks('2026-12-30', 3, '2027-01-05')).toEqual([
      { start: '2026-12-28', end: '2027-01-03', week: 53, month: '2026-12', current: false },
      { start: '2027-01-04', end: '2027-01-10', week: 1, month: '2027-01', current: true },
      { start: '2027-01-11', end: '2027-01-17', week: 2, month: '2027-01', current: false },
    ]);
    expect(matrixWeeks('2026-11-16', 99, '2026-11-16')).toHaveLength(53);
  });
  it('rechnet freie Kapazität aus Arbeitszeitmodell, Abwesenheit und Plan – jede Person einmal', () => {
    const m = capacityMatrix(base());
    expect(m.weeks.map((w) => w.week)).toEqual([47, 48, 49]);
    expect(m.people.map((p) => p.user_id)).toEqual(['ana', 'ben', 'cle']);
    const [ana, ben, cle] = m.people;
    // Ana: drei Zeilen in zwei Projekten zählen zusammen; KW 47 ist mit 45 h überbucht, KW 48 fehlen zwei Urlaubstage.
    expect(ana.planned).toEqual([2700, 1200, 0]);
    expect(ana.target).toEqual([2400, 2400, 2400]); expect(ana.absent).toEqual([0, 960, 0]); expect(ana.available).toEqual([2400, 1440, 2400]);
    expect(ana.free).toEqual([-300, 240, 2400]);
    expect(ana.service_types).toEqual(['pm', 'cd']);
    // Ben arbeitet Teilzeit (24 h); der beantragte Urlaub ist noch nicht genehmigt und zählt nicht.
    expect(ben.available).toEqual([1440, 1440, 1440]); expect(ben.free).toEqual([-60, 1440, 1440]);
    // Ohne Arbeitszeitmodell gibt es kein Soll.
    expect(cle.available).toEqual([null, null, null]); expect(cle.free).toEqual([null, null, null]);
    expect(m.overbooked).toBe(2);
    expect([freeLevel(ana, 0), freeLevel(ana, 1), freeLevel(ana, 2), freeLevel(cle, 0)]).toEqual(['over', 'tight', 'free', 'unknown']);
  });
  it('führt offene Zeilen getrennt und summiert das Team', () => {
    const m = capacityMatrix(base());
    expect(m.open).toEqual([0, 960, 0]);
    expect(m.planned).toEqual([4200, 2160, 0]);
    expect(m.available).toEqual([3840, 2880, 3840]);
  });
  it('baut Projektblöcke mit Summen über den ganzen Zeitraum und gebuchter Zeit daneben', () => {
    const [p1, p2] = capacityMatrix(base()).projects;
    expect(p1.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(p1.planned).toEqual([2700, 2160, 0]);
    expect(p1.rows[0]).toMatchObject({ cells: [1200, 1200, 0], visible: 2400, total: 3399, actual: [300, 0, 0] });
    expect(p1.total).toBe(3399 + 1500 + 960); expect(p1.offered).toBe(4800);
    // Gebucht: Anas Zeit und die einer Person ohne Planzeile; bei zwei Rollen steht die Zeit nur in der ersten Zeile.
    expect(p1.actual).toEqual([360, 0, 0]);
    expect(p2.rows.map((r) => r.actual[0])).toEqual([120, 0]); expect(p2.actual).toEqual([120, 0, 0]);
  });
  it('legt Phasen als Balken über die Wochen', () => {
    const [p1] = capacityMatrix(base()).projects;
    expect(p1.phases.map((p) => [p.name, p.from, p.to])).toEqual([['Konzept', 0, 0], ['Entwurf', 1, 2], ['Nachlauf', -1, -1]]);
    // Eine Phase von zwei Tagen am Wochenanfang bleibt sichtbar, eine außerhalb des Ausschnitts nicht.
    const short = capacityMatrix(base({ phases: [{ id: 'x', project_id: 'p1', name: 'Kickoff', position: 1, starts_on: '2026-11-23', ends_on: '2026-11-24', budget_minutes: 0 }, { id: 'y', project_id: 'p1', name: 'Alt', position: 2, starts_on: '2026-01-01', ends_on: '2026-02-01', budget_minutes: 0 }] })).projects[0];
    expect(short.phases.map((p) => [p.from, p.to])).toEqual([[1, 1], [-1, -1]]);
  });
});

describe('Hilfen für Eingabe und Buchung', () => {
  it('liest und schreibt Stunden', () => {
    expect([parseHours(''), parseHours('8'), parseHours('7,5'), parseHours('7.25'), parseHours('1:30'), parseHours('40')]).toEqual([0, 480, 450, 435, 90, 2400]);
    expect([parseHours('abc'), parseHours('-2'), parseHours('200'), parseHours('1:75')]).toEqual([null, null, null, null]);
    expect([hoursText(2400), hoursText(450), hoursText(445, 'en'), hoursText(0)]).toEqual(['40', '7,5', '7.4', '0']);
  });
  it('schlägt Phase und Leistungsart nur vor, wenn sie eindeutig sind', () => {
    const phases = base().phases;
    expect(phaseForDay(phases, 'p1', '2026-11-17')?.id).toBe('ph1'); expect(phaseForDay(phases, 'p1', '2026-11-23')?.id).toBe('ph2');
    expect(phaseForDay(phases, 'p1', '2028-01-01')).toBeNull(); expect(phaseForDay(phases, 'p2', '2026-11-17')).toBeNull();
    expect(phaseForDay([...phases, { ...phases[0], id: 'dup' }], 'p1', '2026-11-17')).toBeNull();
    const rows = base().rows;
    expect(serviceTypeForPerson(rows, 'p1', 'ana')).toBe('pm'); expect(serviceTypeForPerson(rows, 'p2', 'ana')).toBeNull(); expect(serviceTypeForPerson(rows, 'p1', 'cle')).toBeNull();
  });
});
