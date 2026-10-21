import { describe, expect, it } from 'vitest';
import { easterSunday, holidaysBetween, holidaysFor, isLocation, LOCATIONS, locationName } from '../src/shared/holidays';

const dates = (location: string, year: number) => holidaysFor(location, year).map((h) => h.date);
const has = (location: string, year: number, date: string) => dates(location, year).includes(date);

describe('public holidays', () => {
  it('computes Easter with the Gauss formula for known years', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2038)).toBe('2038-04-25'); // spätester Termin
  });
  it('derives movable German holidays from Easter', () => {
    expect(has('DE', 2026, '2026-04-03')).toBe(true); // Karfreitag
    expect(has('DE', 2026, '2026-04-06')).toBe(true); // Ostermontag
    expect(has('DE', 2026, '2026-05-14')).toBe(true); // Christi Himmelfahrt
    expect(has('DE', 2026, '2026-05-25')).toBe(true); // Pfingstmontag
    expect(has('DE', 2026, '2026-06-04')).toBe(false); // Fronleichnam nicht bundesweit
    expect(has('DE-BW', 2026, '2026-06-04')).toBe(true);
  });
  it('applies regional German rules', () => {
    for (const region of ['DE-BW', 'DE-BY', 'DE-NW', 'DE-RP', 'DE-SL']) expect(has(region, 2026, '2026-11-01')).toBe(true); // Allerheiligen
    for (const region of ['DE-BE', 'DE-HH', 'DE-SN']) expect(has(region, 2026, '2026-11-01')).toBe(false);
    for (const region of ['DE-HH', 'DE-SN', 'DE-NI', 'DE-SH']) expect(has(region, 2026, '2026-10-31')).toBe(true); // Reformationstag
    expect(has('DE-BW', 2026, '2026-10-31')).toBe(false);
    expect(has('DE-SN', 2026, '2026-11-18')).toBe(true); // Buß- und Bettag 2026
    expect(has('DE-SN', 2025, '2025-11-19')).toBe(true);
    expect(has('DE-BY', 2026, '2026-11-18')).toBe(false);
    expect(has('DE-BE', 2026, '2026-03-08')).toBe(true); // Frauentag
    expect(has('DE-TH', 2026, '2026-09-20')).toBe(true); // Weltkindertag
    expect(has('DE-BW', 2026, '2026-01-06')).toBe(true);
    expect(has('DE-HE', 2026, '2026-01-06')).toBe(false);
    expect(dates('DE', 2026)).toHaveLength(9);
    expect(dates('DE-BW', 2026)).toHaveLength(12);
    expect(dates('DE-BY', 2026)).toHaveLength(13);
  });
  it('knows Austrian and Swiss calendars', () => {
    expect(has('AT', 2026, '2026-10-26')).toBe(true);
    expect(has('AT-9', 2026, '2026-11-15')).toBe(true); // Leopoldi
    expect(has('AT-1', 2026, '2026-11-15')).toBe(false);
    expect(dates('AT', 2026)).toHaveLength(13);
    expect(has('CH', 2026, '2026-08-01')).toBe(true);
    expect(has('CH', 2026, '2026-04-03')).toBe(false); // Karfreitag kantonal
    expect(has('CH-ZH', 2026, '2026-04-03')).toBe(true);
    expect(has('CH-ZH', 2026, '2026-01-02')).toBe(true); // Berchtoldstag
    expect(has('CH-LU', 2026, '2026-06-04')).toBe(true); // Fronleichnam katholisch
    expect(has('CH-ZH', 2026, '2026-06-04')).toBe(false);
    expect(has('CH-GE', 2026, '2026-09-10')).toBe(true); // Jeûne genevois: Donnerstag nach dem ersten Septembersonntag 2026
  });
  it('is sorted, deduplicated and empty for unknown locations', () => {
    const list = holidaysFor('DE-BY', 2026);
    expect(list.map((h) => h.date).sort()).toEqual(list.map((h) => h.date));
    expect(new Set(list.map((h) => h.date)).size).toBe(list.length);
    expect(holidaysFor('XX', 2026)).toEqual([]);
    expect(holidaysFor(null, 2026)).toEqual([]);
    expect(holidaysFor('DE-BW', 1999)).toEqual([]);
    expect(holidaysFor('de-bw', 2026)).toEqual([]);
  });
  it('collects holidays across a year boundary and validates codes', () => {
    const map = holidaysBetween('DE-BW', '2026-12-20', '2027-01-10');
    expect([...map.keys()]).toEqual(['2026-12-25', '2026-12-26', '2027-01-01', '2027-01-06']);
    expect(map.get('2027-01-06')).toBe('Heilige Drei Könige');
    expect(holidaysBetween('DE', '2026-02-01', '2026-01-01').size).toBe(0);
    expect(isLocation('DE-BW')).toBe(true);
    expect(isLocation('AT-9')).toBe(true);
    expect(isLocation('DE-BWX1')).toBe(false);
    expect(LOCATIONS.every((l) => isLocation(l.code))).toBe(true);
    expect(locationName('DE-BW')).toBe('Baden-Württemberg');
    expect(locationName('ZZ')).toBe('ZZ');
  });
});
