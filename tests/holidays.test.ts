import { describe, expect, it } from 'vitest';
import { easterSunday, holidaysBetween, holidaysFor, isLocation, locationChoices, LOCATIONS, locationName, makeupDaysBetween, makeupDaysFor, OFFICES, planKnown } from '../src/shared/holidays';

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

describe('China', () => {
  const makeup = (year: number) => makeupDaysFor('CN-SH', year).map((h) => h.date);
  it('follows the official plan where it is published', () => {
    // 2026: Frühlingsfest neun Tage am Stück, Nationalfeiertag sieben.
    expect(has('CN', 2026, '2026-02-15')).toBe(true);
    expect(has('CN', 2026, '2026-02-23')).toBe(true);
    expect(has('CN', 2026, '2026-02-24')).toBe(false);
    expect(dates('CN', 2026).filter((d) => d >= '2026-10-01' && d <= '2026-10-07')).toHaveLength(7);
    expect(makeup(2026)).toEqual(['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']);
    // 2027 (Mitteilung vom 5.11.2026): Drachenboot- und Mittherbstfest je ein Tag ohne Ausgleich.
    expect(dates('CN', 2027).filter((d) => d >= '2027-02-01' && d <= '2027-02-28')).toEqual(['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13']);
    expect(has('CN', 2027, '2027-06-09')).toBe(true);
    expect(has('CN', 2027, '2027-09-15')).toBe(true);
    expect(makeup(2027)).toEqual(['2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09']);
    expect(dates('CN', 2027)).toHaveLength(29);
    // 2025: Nationalfeiertag und Mittherbstfest fallen zusammen.
    expect(dates('CN', 2025).filter((d) => d >= '2025-10-01' && d <= '2025-10-31')).toHaveLength(8);
    expect(planKnown('CN-SH', 2027)).toBe(true);
    expect(planKnown('CN', 2028)).toBe(false);
  });
  it('computes the thirteen statutory days for years without a plan', () => {
    // 2028: Frühlingsfest am 26.1., Qingming 4.4., Drachenbootfest 28.5., Mittherbstfest 3.10. (fällt auf den Nationalfeiertag).
    const d = dates('CN', 2028);
    for (const day of ['2028-01-01', '2028-01-25', '2028-01-26', '2028-01-27', '2028-01-28', '2028-04-04', '2028-05-01', '2028-05-02', '2028-05-28', '2028-10-01', '2028-10-02', '2028-10-03']) expect(d).toContain(day);
    expect(d).toHaveLength(12); // 13 Tage, einer doppelt belegt
    expect(makeup(2028)).toEqual([]);
    // Bekannte Neujahrstage des Mondkalenders – 2027 und 2030 liegen wenige Minuten vor bzw. nach Mitternacht.
    const spring = (year: number) => holidaysFor('CN', year).filter((h) => h.name.startsWith('Frühlingsfest'))[1].date;
    expect(spring(2024)).toBe('2024-02-10');
    expect(spring(2029)).toBe('2029-02-13');
    expect(spring(2030)).toBe('2030-02-03');
    expect(spring(2033)).toBe('2033-01-31');
    expect(has('CN', 2024, '2024-04-04')).toBe(true); // Qingming
    expect(has('CN', 2031, '2031-04-05')).toBe(true);
    expect(has('CN', 2024, '2024-06-10')).toBe(true); // Drachenbootfest
    expect(has('CN', 2024, '2024-09-17')).toBe(true); // Mittherbstfest
    expect(has('CN', 2029, '2029-09-22')).toBe(true);
  });
  it('treats every mainland region alike and stays out of other countries', () => {
    expect(dates('CN-SH', 2026)).toEqual(dates('CN', 2026));
    expect(dates('CN-XX', 2026)).toEqual(dates('CN', 2026));
    expect(makeupDaysFor('DE-HE', 2026)).toEqual([]);
    expect(makeupDaysFor(null, 2026)).toEqual([]);
    expect([...makeupDaysBetween('CN', '2026-02-01', '2027-02-01').keys()]).toEqual(['2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10', '2027-01-31']);
    expect(LOCATIONS.filter((l) => l.country === 'CN').map((l) => l.code)).toEqual(['CN', 'CN-SH', 'CN-GD']);
    expect(locationName('CN-SH')).toBe('Shanghai');
    // Jeder Ausgleichs-Arbeitstag liegt am Wochenende und ist kein freier Tag.
    for (const year of [2025, 2026, 2027]) for (const day of makeup(year)) { expect([0, 6]).toContain(new Date(`${day}T12:00:00Z`).getUTCDay()); expect(has('CN', year, day)).toBe(false); }
  });
});

describe('Singapore and the Emirates', () => {
  it('follows the gazetted Singapore holidays including the Monday after a Sunday', () => {
    expect(dates('SG', 2026)).toEqual(['2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03', '2026-05-01', '2026-05-27', '2026-05-31', '2026-06-01', '2026-08-09', '2026-08-10', '2026-11-08', '2026-11-09', '2026-12-25']);
    expect(dates('SG', 2027)).toEqual(['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-03-10', '2027-03-26', '2027-05-01', '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25']);
    expect(holidaysFor('SG', 2027).find((h) => h.date === '2027-10-28')?.name).toBe('Deepavali');
    expect(planKnown('SG', 2027)).toBe(true);
    // Ohne amtliche Liste: feste Tage, chinesisches Neujahr, Karfreitag – und die Sonntagsregel.
    expect(planKnown('SG', 2028)).toBe(false);
    expect(dates('SG', 2028)).toEqual(['2028-01-01', '2028-01-26', '2028-01-27', '2028-04-14', '2028-05-01', '2028-08-09', '2028-12-25']);
    expect(dates('SG', 2030)).toContain('2030-02-03'); // Sonntag
    expect(dates('SG', 2030)).toContain('2030-02-04');
    expect(dates('SG', 2030)).toContain('2030-02-05'); // Ersatz für den Sonntag, weil der Montag selbst Feiertag ist
    expect(makeupDaysFor('SG', 2026)).toEqual([]);
  });
  it('knows the Emirates plan and marks unconfirmed years as provisional', () => {
    expect(dates('AE-DU', 2026)).toEqual(['2026-01-01', '2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-06-16', '2026-08-28', '2026-12-02', '2026-12-03']);
    expect(dates('AE', 2026)).toEqual(dates('AE-DU', 2026));
    expect(planKnown('AE-DU', 2026)).toBe(true);
    expect(dates('AE-DU', 2027)).toContain('2027-03-09'); // Eid al-Fitr nach Kalender
    expect(planKnown('AE-DU', 2027)).toBe(false); // Mondsichtung steht aus
    expect(dates('AE-DU', 2030)).toEqual(['2030-01-01', '2030-12-02', '2030-12-03']);
    expect(planKnown('AE-DU', 2030)).toBe(false);
    expect(planKnown('DE-HE', 2040)).toBe(true);
    expect(planKnown(null, 2026)).toBe(true);
  });
  it('offers only the company offices, keeping a stored region selectable', () => {
    expect(OFFICES.map((o) => o.name)).toEqual(['Frankfurt', 'Shanghai', 'Shenzhen', 'Dubai', 'Singapur']);
    expect(OFFICES.every((o) => LOCATIONS.some((l) => l.code === o.code))).toBe(true);
    expect(OFFICES.every((o) => holidaysFor(o.code, 2026).length >= 10)).toBe(true);
    expect(locationName('DE-HE')).toBe('Frankfurt');
    expect(locationName('CN-GD')).toBe('Shenzhen');
    expect(locationName('SG')).toBe('Singapur');
    expect(locationChoices(null)).toEqual(OFFICES);
    expect(locationChoices('CN-SH')).toEqual(OFFICES);
    expect(locationChoices('DE-BW').map((o) => o.name)).toEqual(['Frankfurt', 'Shanghai', 'Shenzhen', 'Dubai', 'Singapur', 'Baden-Württemberg']);
  });
});
