/**
 * Gesetzliche Feiertage je Standort, rein gerechnet (kein Netzabruf). Ein Standort ist
 * `LAND` oder `LAND-REGION` nach ISO 3166-2, z. B. `DE-BW`, `AT-9`, `CH-ZH`. Unbekannte
 * Regionen fallen auf die bundesweiten Feiertage des Landes zurück; unbekannte Länder
 * haben keine Feiertage (die Kapazitätsrechnung bleibt dann wie bisher).
 */
export interface Holiday { date: string; name: string }

export const LOCATIONS: { code: string; country: string; name: string }[] = [
  { code: 'DE', country: 'DE', name: 'Deutschland (nur bundesweit)' },
  { code: 'DE-BW', country: 'DE', name: 'Baden-Württemberg' },
  { code: 'DE-BY', country: 'DE', name: 'Bayern' },
  { code: 'DE-BE', country: 'DE', name: 'Berlin' },
  { code: 'DE-BB', country: 'DE', name: 'Brandenburg' },
  { code: 'DE-HB', country: 'DE', name: 'Bremen' },
  { code: 'DE-HH', country: 'DE', name: 'Hamburg' },
  { code: 'DE-HE', country: 'DE', name: 'Hessen' },
  { code: 'DE-MV', country: 'DE', name: 'Mecklenburg-Vorpommern' },
  { code: 'DE-NI', country: 'DE', name: 'Niedersachsen' },
  { code: 'DE-NW', country: 'DE', name: 'Nordrhein-Westfalen' },
  { code: 'DE-RP', country: 'DE', name: 'Rheinland-Pfalz' },
  { code: 'DE-SL', country: 'DE', name: 'Saarland' },
  { code: 'DE-SN', country: 'DE', name: 'Sachsen' },
  { code: 'DE-ST', country: 'DE', name: 'Sachsen-Anhalt' },
  { code: 'DE-SH', country: 'DE', name: 'Schleswig-Holstein' },
  { code: 'DE-TH', country: 'DE', name: 'Thüringen' },
  { code: 'AT', country: 'AT', name: 'Österreich (nur bundesweit)' },
  { code: 'AT-1', country: 'AT', name: 'Burgenland' },
  { code: 'AT-2', country: 'AT', name: 'Kärnten' },
  { code: 'AT-3', country: 'AT', name: 'Niederösterreich' },
  { code: 'AT-4', country: 'AT', name: 'Oberösterreich' },
  { code: 'AT-5', country: 'AT', name: 'Salzburg' },
  { code: 'AT-6', country: 'AT', name: 'Steiermark' },
  { code: 'AT-7', country: 'AT', name: 'Tirol' },
  { code: 'AT-8', country: 'AT', name: 'Vorarlberg' },
  { code: 'AT-9', country: 'AT', name: 'Wien' },
  { code: 'CH', country: 'CH', name: 'Schweiz (nur bundesweit)' },
  { code: 'CH-ZH', country: 'CH', name: 'Zürich' },
  { code: 'CH-BE', country: 'CH', name: 'Bern' },
  { code: 'CH-BS', country: 'CH', name: 'Basel-Stadt' },
  { code: 'CH-BL', country: 'CH', name: 'Basel-Landschaft' },
  { code: 'CH-GE', country: 'CH', name: 'Genf' },
  { code: 'CH-VD', country: 'CH', name: 'Waadt' },
  { code: 'CH-LU', country: 'CH', name: 'Luzern' },
  { code: 'CH-SG', country: 'CH', name: 'St. Gallen' },
  { code: 'CH-AG', country: 'CH', name: 'Aargau' },
  { code: 'CH-TI', country: 'CH', name: 'Tessin' },
  { code: 'CH-ZG', country: 'CH', name: 'Zug' },
  { code: 'CH-SO', country: 'CH', name: 'Solothurn' },
  { code: 'CH-TG', country: 'CH', name: 'Thurgau' },
  { code: 'CH-GR', country: 'CH', name: 'Graubünden' },
  { code: 'CH-SZ', country: 'CH', name: 'Schwyz' },
  { code: 'CH-FR', country: 'CH', name: 'Freiburg' },
  { code: 'CH-VS', country: 'CH', name: 'Wallis' },
  { code: 'CH-NE', country: 'CH', name: 'Neuenburg' },
  { code: 'CH-JU', country: 'CH', name: 'Jura' },
  { code: 'CH-SH', country: 'CH', name: 'Schaffhausen' },
  { code: 'CH-AR', country: 'CH', name: 'Appenzell Ausserrhoden' },
  { code: 'CH-AI', country: 'CH', name: 'Appenzell Innerrhoden' },
  { code: 'CH-GL', country: 'CH', name: 'Glarus' },
  { code: 'CH-NW', country: 'CH', name: 'Nidwalden' },
  { code: 'CH-OW', country: 'CH', name: 'Obwalden' },
  { code: 'CH-UR', country: 'CH', name: 'Uri' },
];
export const LOCATION_CODES = new Set(LOCATIONS.map((l) => l.code));
export const LOCATION_PATTERN = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
export const isLocation = (code: string) => LOCATION_PATTERN.test(code);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
/** Datum als UTC-Mittag, damit Tagesarithmetik keine Zeitzonenfehler macht. */
const utc = (date: string) => new Date(`${date}T12:00:00Z`);
export function shiftDate(date: string, days: number): string {
  const d = utc(date); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Ostersonntag nach der Gaußschen Osterformel (gregorianisch, Fassung von Lichtenberg). */
export function easterSunday(year: number): string {
  const k = Math.floor(year / 100), m = 15 + Math.floor((3 * k + 3) / 4) - Math.floor((8 * k + 13) / 25), s = 2 - Math.floor((3 * k + 3) / 4);
  const a = year % 19, d = (19 * a + m) % 30, r = Math.floor((d + Math.floor(a / 11)) / 29), og = 21 + d - r;
  const sz = 7 - ((year + Math.floor(year / 4) + s) % 7), oe = 7 - ((og - sz) % 7);
  const os = og + oe; // März-Tag; > 31 heißt April
  return os > 31 ? iso(year, 4, os - 31) : iso(year, 3, os);
}
/** Erster Wochentag (0 = So … 6 = Sa) ab einem Datum, einschließlich. */
function nextWeekday(date: string, weekday: number): string {
  const diff = (weekday - utc(date).getUTCDay() + 7) % 7;
  return shiftDate(date, diff);
}
/** Buß- und Bettag: Mittwoch vor dem 23. November. */
function repentanceDay(year: number): string {
  const nov23 = utc(iso(year, 11, 23)); const back = ((nov23.getUTCDay() - 3) + 7) % 7 || 7;
  return shiftDate(iso(year, 11, 23), -back);
}
const after = (base: Holiday, days: number, label: string): Holiday => ({ date: shiftDate(base.date, days), name: label });

function germany(region: string, year: number): Holiday[] {
  const easter = { date: easterSunday(year), name: 'Ostersonntag' };
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Neujahr' },
    after(easter, -2, 'Karfreitag'),
    after(easter, 1, 'Ostermontag'),
    { date: iso(year, 5, 1), name: 'Tag der Arbeit' },
    after(easter, 39, 'Christi Himmelfahrt'),
    after(easter, 50, 'Pfingstmontag'),
    { date: iso(year, 10, 3), name: 'Tag der Deutschen Einheit' },
    { date: iso(year, 12, 25), name: '1. Weihnachtstag' },
    { date: iso(year, 12, 26), name: '2. Weihnachtstag' },
  ];
  const has = (...regions: string[]) => regions.includes(region);
  if (has('BW', 'BY', 'ST')) list.push({ date: iso(year, 1, 6), name: 'Heilige Drei Könige' });
  if (has('BE', 'MV')) list.push({ date: iso(year, 3, 8), name: 'Internationaler Frauentag' });
  if (has('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) list.push(after(easter, 60, 'Fronleichnam'));
  if (has('SL', 'BY')) list.push({ date: iso(year, 8, 15), name: 'Mariä Himmelfahrt' }); // Bayern: nur katholische Gemeinden – als Standard angenommen
  if (has('TH')) list.push({ date: iso(year, 9, 20), name: 'Weltkindertag' });
  if (has('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH')) list.push({ date: iso(year, 10, 31), name: 'Reformationstag' });
  if (has('BW', 'BY', 'NW', 'RP', 'SL')) list.push({ date: iso(year, 11, 1), name: 'Allerheiligen' });
  if (has('SN')) list.push({ date: repentanceDay(year), name: 'Buß- und Bettag' });
  // Augsburger Friedensfest (8.8.) gilt nur in der Stadt Augsburg und ist bewusst nicht enthalten.
  return list;
}
function austria(region: string, year: number): Holiday[] {
  const easter = { date: easterSunday(year), name: 'Ostersonntag' };
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Neujahr' },
    { date: iso(year, 1, 6), name: 'Heilige Drei Könige' },
    after(easter, 1, 'Ostermontag'),
    { date: iso(year, 5, 1), name: 'Staatsfeiertag' },
    after(easter, 39, 'Christi Himmelfahrt'),
    after(easter, 50, 'Pfingstmontag'),
    after(easter, 60, 'Fronleichnam'),
    { date: iso(year, 8, 15), name: 'Mariä Himmelfahrt' },
    { date: iso(year, 10, 26), name: 'Nationalfeiertag' },
    { date: iso(year, 11, 1), name: 'Allerheiligen' },
    { date: iso(year, 12, 8), name: 'Mariä Empfängnis' },
    { date: iso(year, 12, 25), name: 'Christtag' },
    { date: iso(year, 12, 26), name: 'Stefanitag' },
  ];
  const landes: Record<string, Holiday> = {
    '1': { date: iso(year, 11, 11), name: 'Martinstag' },
    '2': { date: iso(year, 10, 10), name: 'Tag der Volksabstimmung' },
    '3': { date: iso(year, 11, 15), name: 'Leopoldi' },
    '4': { date: iso(year, 5, 4), name: 'Florianitag' },
    '5': { date: iso(year, 9, 24), name: 'Rupertitag' },
    '6': { date: iso(year, 3, 19), name: 'Josefitag' },
    '7': { date: iso(year, 3, 19), name: 'Josefitag' },
    '8': { date: iso(year, 3, 19), name: 'Josefitag' },
    '9': { date: iso(year, 11, 15), name: 'Leopoldi' },
  };
  if (landes[region]) list.push(landes[region]);
  return list;
}
function switzerland(region: string, year: number): Holiday[] {
  const easter = { date: easterSunday(year), name: 'Ostersonntag' };
  // Bundesweit nur vier Tage; kantonale Feiertage als gängige Auswahl der gesetzlich anerkannten Tage.
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Neujahr' },
    after(easter, 39, 'Auffahrt'),
    { date: iso(year, 8, 1), name: 'Bundesfeiertag' },
    { date: iso(year, 12, 25), name: 'Weihnachten' },
  ];
  if (!region) return list;
  const has = (...regions: string[]) => regions.includes(region);
  const catholic = ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU', 'AG'];
  if (!has('VS', 'TI')) list.push(after(easter, -2, 'Karfreitag'));
  if (!has('VS')) list.push(after(easter, 1, 'Ostermontag'));
  if (!has('VS')) list.push(after(easter, 50, 'Pfingstmontag'));
  if (!has('GE')) list.push({ date: iso(year, 12, 26), name: 'Stephanstag' });
  if (has('ZH', 'BE', 'BS', 'BL', 'SH', 'TG', 'AG', 'GL', 'JU', 'NE', 'GE', 'SO', 'TI', 'ZG', 'VD', 'FR', 'SG', 'AR', 'AI')) list.push({ date: iso(year, 1, 2), name: 'Berchtoldstag' });
  if (has('ZH', 'BS', 'BL', 'SH', 'TG', 'SO', 'JU', 'NE', 'VD', 'BE', 'AG', 'LU', 'GL', 'ZG', 'SG', 'AR', 'AI', 'TI', 'GE', 'FR', 'VS')) list.push({ date: iso(year, 5, 1), name: 'Tag der Arbeit' }); // breit üblich, teils nur halbtags
  if (has(...catholic)) list.push(after(easter, 60, 'Fronleichnam'), { date: iso(year, 8, 15), name: 'Mariä Himmelfahrt' }, { date: iso(year, 11, 1), name: 'Allerheiligen' }, { date: iso(year, 12, 8), name: 'Mariä Empfängnis' });
  if (has('LU', 'UR', 'SZ', 'OW', 'NW', 'ZG', 'FR', 'SO', 'AI', 'TI', 'VS', 'JU', 'AG', 'GR', 'SG')) list.push({ date: iso(year, 1, 6), name: 'Heilige Drei Könige' });
  // Jeûne genevois: Donnerstag nach dem ersten Septembersonntag; Jeûne fédéral: dritter Septembersonntag, der Montag danach ist in der Waadt frei.
  if (has('GE')) list.push({ date: shiftDate(nextWeekday(iso(year, 9, 1), 0), 4), name: 'Jeûne genevois' }, { date: iso(year, 12, 31), name: 'Restauration de la République' });
  if (has('VD')) list.push({ date: shiftDate(nextWeekday(iso(year, 9, 1), 0), 15), name: 'Lundi du Jeûne fédéral' });
  if (has('NE')) list.push({ date: iso(year, 3, 1), name: 'Jahrestag der Republik' });
  if (has('JU')) list.push({ date: iso(year, 6, 23), name: 'Fest der Unabhängigkeit' });
  if (has('TI')) list.push({ date: iso(year, 3, 19), name: 'Josefstag' }, { date: iso(year, 6, 29), name: 'Peter und Paul' });
  return dedupe(list);
}
function dedupe(list: Holiday[]) { const seen = new Set<string>(); return list.filter((h) => !seen.has(h.date) && seen.add(h.date)); }

/** Gesetzliche Feiertage eines Jahres am Standort, sortiert nach Datum. */
export function holidaysFor(location: string | null | undefined, year: number): Holiday[] {
  if (!location || !isLocation(location) || year < 2000 || year > 2100) return [];
  const [country, region = ''] = location.split('-');
  const list = country === 'DE' ? germany(region, year) : country === 'AT' ? austria(region, year) : country === 'CH' ? switzerland(region, year) : [];
  return dedupe(list).sort((a, b) => a.date.localeCompare(b.date));
}
/** Feiertage im Zeitraum (inklusive), als Map Datum → Name. */
export function holidaysBetween(location: string | null | undefined, from: string, to: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!location || from > to) return result;
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of holidaysFor(location, year)) if (h.date >= from && h.date <= to) result.set(h.date, h.name);
  }
  return result;
}
export const locationName = (code: string | null | undefined) => LOCATIONS.find((l) => l.code === code)?.name ?? code ?? '';
