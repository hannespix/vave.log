/**
 * Gesetzliche Feiertage je Standort, rein gerechnet (kein Netzabruf). Ein Standort ist
 * `LAND` oder `LAND-REGION` nach ISO 3166-2, z. B. `DE-BW`, `AT-9`, `CH-ZH`. Unbekannte
 * Regionen fallen auf die bundesweiten Feiertage des Landes zurück; unbekannte Länder
 * haben keine Feiertage (die Kapazitätsrechnung bleibt dann wie bisher).
 *
 * Länder mit amtlichem Jahresplan (China, Singapur, Emirate) stehen weiter unten.
 * China (Festland) kennt neben freien Tagen auch Ausgleichs-Arbeitstage: Wochenendtage, an denen
 * gearbeitet wird, damit eine Feiertagswoche am Stück frei ist (调休). Die liefert `makeupDaysFor`.
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
  // Festlandchina: Die gesetzlichen Feiertage gelten landesweit; die Regionen dienen nur der Zuordnung.
  { code: 'CN', country: 'CN', name: 'China (Festland)' },
  { code: 'CN-SH', country: 'CN', name: 'Shanghai' },
  { code: 'CN-GD', country: 'CN', name: 'Guangdong (Shenzhen)' },
  { code: 'AE', country: 'AE', name: 'Vereinigte Arabische Emirate' },
  { code: 'AE-DU', country: 'AE', name: 'Dubai' },
  { code: 'SG', country: 'SG', name: 'Singapur' },
];
/**
 * Die Standorte der Firma: Nur sie stehen zur Auswahl. Jeder Ort zeigt auf die Feiertagsregion, in der er liegt.
 * Der Rechenkern kennt weiterhin alle Regionen aus `LOCATIONS` – ein früher gespeicherter Standort bleibt gültig.
 */
export const OFFICES: { code: string; name: string }[] = [
  { code: 'DE-HE', name: 'Frankfurt' },
  { code: 'CN-SH', name: 'Shanghai' },
  { code: 'CN-GD', name: 'Shenzhen' },
  { code: 'AE-DU', name: 'Dubai' },
  { code: 'SG', name: 'Singapur' },
];
/** Auswahlliste: die Firmenstandorte, dazu der aktuell gespeicherte Wert, falls er kein Firmenstandort ist. */
export function locationChoices(current?: string | null): { code: string; name: string }[] {
  if (!current || OFFICES.some((o) => o.code === current)) return OFFICES;
  return [...OFFICES, { code: current, name: locationName(current) }];
}
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
/**
 * Länder mit amtlichem Jahresplan: China, Singapur, Vereinigte Arabische Emirate. Dort stehen bewegliche
 * Feiertage erst fest, wenn die Behörde sie bekannt gibt (Mondkalender, Mondsichtung, Verlegungen).
 * Je Land und Jahr: freie Tage als [von, bis, Name] und Ausgleichs-Arbeitstage, jeweils MM-TT.
 * Fehlt ein Jahr, gilt nur, was sich sicher rechnen lässt – `planKnown` sagt, ob der Plan vorliegt.
 */
type YearPlan = { off: [from: string, to: string, name: string][]; work?: string[] };

/**
 * China (Festland). Zwei Quellen:
 * 1. Der amtliche Plan des Staatsrats je Jahr (meist Anfang November für das Folgejahr): freie Tage
 *    am Stück und die Ausgleichs-Arbeitstage am Wochenende. Hinterlegt für 2025–2027.
 * 2. Für alle anderen Jahre die 13 gesetzlichen Feiertage, gerechnet – ohne Brückentage und ohne
 *    Ausgleichs-Arbeitstage, weil die erst der amtliche Plan festlegt. `planKnown` sagt, was gilt.
 *
 * Mondkalender-Feste (Frühlingsfest, Drachenbootfest, Mittherbstfest) je Jahr 2000–2100 als MMTT·3.
 * Erzeugt aus dem chinesischen Kalender der ICU und gegen die Neumond-Rechnung nach Meeus in
 * chinesischer Zeit geprüft (korrigiert: 2027 und 2030, dort lag die ICU einen Tag daneben).
 * Ab etwa 2050 vorläufig: Liegt ein Neumond wenige Minuten um Mitternacht, kann der Tag kippen.
 */
const CN_LUNAR = '020506060912 012406251001 021206150921 020106040911 012206220928 020906110918 012905311006 021806190925 020706080914 012605281003 021406160922 020306060912 012306230930 021006120919 013106020908 021906200927 020806090915 012805301004 021606180924 020506070913 012506251001 021206140921 020106030910 012206220929 021006100917 012905311006 021706190925 020606090915 012605281003 021306160922 020306050912 012306241001 021106120919 013106010908 021906200927 020806100916 012805301004 021506180924 020406070913 012405271002 021206140920 020106030910 012206220928 021006110917 013005311005 021706190925 020606080915 012605291004 021406150922 020206040911 012306230930 021106130919 020106010907 021906200926 020806100916 012805301005 021506170924 020406060913 012406251002 021206140921 020206030909 012106220928 020906110917 012906011006 021706190925 020506080915 012605281003 021406160923 020306040911 012306230929 021106130919 013106020908 021906200926 020706100916 012705301005 021506170924 020506060912 012406241001 021206140920 020206040910 012206220928 020906110917 012906011006 021706190926 020606070914 012605271003 021406150922 020306050911 012406230929 021006130918 013006020908 021806210927 020706090916 012705291005 021506170924 020506060913 012506240930 021206140920 020106040909 012106230929 020906120918'.split(' ');
function chinaLunar(year: number): { spring: string; dragonBoat: string; midAutumn: string } | null {
  const row = CN_LUNAR[year - 2000];
  if (!row) return null;
  const at = (i: number) => iso(year, Number(row.slice(i, i + 2)), Number(row.slice(i + 2, i + 4)));
  return { spring: at(0), dragonBoat: at(4), midAutumn: at(8) };
}
/** Qingming (Sonnenterm, 4. oder 5. April), Näherungsformel für das 21. Jahrhundert. */
function qingming(year: number): string {
  const y = year % 100;
  return iso(year, 4, year >= 2100 ? 5 : Math.floor(y * 0.2422 + 4.81) - Math.floor(y / 4));
}
const CN = { newYear: 'Neujahr (元旦)', spring: 'Frühlingsfest (春节)', qingming: 'Qingming-Fest (清明节)', labour: 'Tag der Arbeit (劳动节)', dragonBoat: 'Drachenbootfest (端午节)', midAutumn: 'Mittherbstfest (中秋节)', national: 'Nationalfeiertag (国庆节)', makeup: 'Ausgleichs-Arbeitstag (调休)' };
/** Amtliche Pläne (Mitteilungen des Staatsrats). Daten als MM-TT im jeweiligen Jahr. */
const CN_PLANS: Record<number, YearPlan> = {
  2025: { off: [['01-01', '01-01', CN.newYear], ['01-28', '02-04', CN.spring], ['04-04', '04-06', CN.qingming], ['05-01', '05-05', CN.labour], ['05-31', '06-02', CN.dragonBoat], ['10-01', '10-08', `${CN.national} · ${CN.midAutumn}`]], work: ['01-26', '02-08', '04-27', '09-28', '10-11'] },
  2026: { off: [['01-01', '01-03', CN.newYear], ['02-15', '02-23', CN.spring], ['04-04', '04-06', CN.qingming], ['05-01', '05-05', CN.labour], ['06-19', '06-21', CN.dragonBoat], ['09-25', '09-27', CN.midAutumn], ['10-01', '10-07', CN.national]], work: ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10'] },
  2027: { off: [['01-01', '01-03', CN.newYear], ['02-05', '02-13', CN.spring], ['04-03', '04-05', CN.qingming], ['05-01', '05-05', CN.labour], ['06-09', '06-09', CN.dragonBoat], ['09-15', '09-15', CN.midAutumn], ['10-01', '10-07', CN.national]], work: ['01-31', '02-14', '05-08', '09-26', '10-09'] },
};
const planDays = (plan: YearPlan, year: number): Holiday[] => {
  const list: Holiday[] = [];
  for (const [from, to, name] of plan.off) for (let day = `${year}-${from}`; day <= `${year}-${to}`; day = shiftDate(day, 1)) list.push({ date: day, name });
  return list;
};
function china(year: number): Holiday[] {
  const plan = CN_PLANS[year];
  if (plan) return planDays(plan, year);
  const lunar = chinaLunar(year);
  const list: Holiday[] = [{ date: iso(year, 1, 1), name: CN.newYear }, { date: qingming(year), name: CN.qingming }, { date: iso(year, 5, 1), name: CN.labour }, { date: iso(year, 5, 2), name: CN.labour },
    { date: iso(year, 10, 1), name: CN.national }, { date: iso(year, 10, 2), name: CN.national }, { date: iso(year, 10, 3), name: CN.national }];
  if (lunar) {
    for (const offset of [-1, 0, 1, 2]) list.push({ date: shiftDate(lunar.spring, offset), name: CN.spring }); // Vorabend und die ersten drei Tage
    list.push({ date: lunar.dragonBoat, name: CN.dragonBoat }, { date: lunar.midAutumn, name: CN.midAutumn });
  }
  return list;
}

/**
 * Singapur: elf gesetzliche Feiertage laut Arbeitsministerium (MOM), hinterlegt für 2025–2027. Fällt ein
 * Feiertag auf einen Sonntag, ist der Montag danach frei (steht in den Plänen schon drin). Für andere Jahre
 * werden nur die festen Tage, das chinesische Neujahr und Karfreitag gerechnet; Hari Raya Puasa, Hari Raya
 * Haji, Vesak und Deepavali fehlen dann, bis das Ministerium sie veröffentlicht (meist im Frühsommer davor).
 */
const SG = { newYear: 'Neujahr', cny: 'Chinesisches Neujahr', puasa: 'Hari Raya Puasa', goodFriday: 'Karfreitag', labour: 'Tag der Arbeit', haji: 'Hari Raya Haji', vesak: 'Vesak', national: 'Nationalfeiertag', deepavali: 'Deepavali', christmas: 'Weihnachten' };
const one = (day: string, name: string): [string, string, string] => [day, day, name];
const SG_PLANS: Record<number, YearPlan> = {
  2025: { off: [one('01-01', SG.newYear), ['01-29', '01-30', SG.cny], one('03-31', SG.puasa), one('04-18', SG.goodFriday), one('05-01', SG.labour), one('05-12', SG.vesak), one('06-07', SG.haji), one('08-09', SG.national), one('10-20', SG.deepavali), one('12-25', SG.christmas)] },
  2026: { off: [one('01-01', SG.newYear), ['02-17', '02-18', SG.cny], one('03-21', SG.puasa), one('04-03', SG.goodFriday), one('05-01', SG.labour), one('05-27', SG.haji), ['05-31', '06-01', SG.vesak], ['08-09', '08-10', SG.national], ['11-08', '11-09', SG.deepavali], one('12-25', SG.christmas)] },
  2027: { off: [one('01-01', SG.newYear), ['02-06', '02-08', SG.cny], one('03-10', SG.puasa), one('03-26', SG.goodFriday), one('05-01', SG.labour), one('05-17', SG.haji), one('05-20', SG.vesak), one('08-09', SG.national), one('10-28', SG.deepavali), one('12-25', SG.christmas)] },
};
function singapore(year: number): Holiday[] {
  const plan = SG_PLANS[year];
  if (plan) return planDays(plan, year);
  const lunar = chinaLunar(year);
  const list: Holiday[] = [{ date: iso(year, 1, 1), name: SG.newYear }, { date: shiftDate(easterSunday(year), -2), name: SG.goodFriday }, { date: iso(year, 5, 1), name: SG.labour }, { date: iso(year, 8, 9), name: SG.national }, { date: iso(year, 12, 25), name: SG.christmas }];
  if (lunar) list.push({ date: lunar.spring, name: SG.cny }, { date: shiftDate(lunar.spring, 1), name: SG.cny });
  // Sonntagsregel: Der nächste Tag, der nicht selbst Feiertag ist, wird frei.
  const taken = new Set(list.map((h) => h.date));
  for (const h of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    if (new Date(`${h.date}T12:00:00Z`).getUTCDay() !== 0) continue;
    let day = shiftDate(h.date, 1); while (taken.has(day)) day = shiftDate(day, 1);
    if (day.startsWith(String(year))) { taken.add(day); list.push({ date: day, name: h.name }); }
  }
  return list;
}

/**
 * Vereinigte Arabische Emirate (Privatwirtschaft, Kabinettsbeschluss 27/2024): Neujahr, Eid al-Fitr, Arafat-Tag,
 * Eid al-Adha, islamisches Neujahr, Geburtstag des Propheten, Nationalfeiertag. Die islamischen Tage hängen an
 * der Mondsichtung und werden erst kurz vorher bestätigt; einzelne Tage verlegt das Kabinett auf den Wochenrand.
 * 2025 und 2026 wie begangen bzw. angekündigt; 2027 nach dem astronomischen Kalender – vorläufig, ±1 Tag.
 * Für andere Jahre nur Neujahr und Nationalfeiertag.
 */
const AE = { newYear: 'Neujahr', fitr: 'Eid al-Fitr', arafat: 'Arafat-Tag', adha: 'Eid al-Adha', hijri: 'Islamisches Neujahr', mawlid: 'Geburtstag des Propheten', national: 'Nationalfeiertag (Eid Al Etihad)' };
const AE_PLANS: Record<number, YearPlan> = {
  2025: { off: [one('01-01', AE.newYear), ['03-30', '04-01', AE.fitr], one('06-05', AE.arafat), ['06-06', '06-08', AE.adha], one('06-27', AE.hijri), one('09-05', AE.mawlid), ['12-01', '12-02', AE.national]] },
  2026: { off: [one('01-01', AE.newYear), ['03-19', '03-22', AE.fitr], one('05-26', AE.arafat), ['05-27', '05-29', AE.adha], one('06-16', AE.hijri), one('08-28', AE.mawlid), ['12-02', '12-03', AE.national]] },
  2027: { off: [one('01-01', AE.newYear), ['03-09', '03-11', AE.fitr], one('05-15', AE.arafat), ['05-16', '05-18', AE.adha], one('06-06', AE.hijri), one('08-14', AE.mawlid), ['12-02', '12-03', AE.national]] },
};
/** Jahre, deren Plan zwar hinterlegt, aber noch nicht amtlich bestätigt ist (Mondsichtung). */
const AE_PROVISIONAL = new Set([2027]);
function emirates(year: number): Holiday[] {
  const plan = AE_PLANS[year];
  if (plan) return planDays(plan, year);
  return [{ date: iso(year, 1, 1), name: AE.newYear }, { date: iso(year, 12, 2), name: AE.national }, { date: iso(year, 12, 3), name: AE.national }];
}
const PLANS: Record<string, Record<number, YearPlan>> = { CN: CN_PLANS, SG: SG_PLANS, AE: AE_PLANS };
/**
 * Liegt für Standort und Jahr der amtliche Feiertagsplan vor? `true` auch für Länder, deren Feiertage sich
 * vollständig rechnen lassen. `false` heißt: Es gelten vorerst nur die sicher rechenbaren Tage.
 */
export function planKnown(location: string | null | undefined, year: number): boolean {
  const country = (location ?? '').split('-')[0];
  const plans = PLANS[country];
  if (!plans) return true;
  return year in plans && !(country === 'AE' && AE_PROVISIONAL.has(year));
}
function dedupe(list: Holiday[]) { const seen = new Set<string>(); return list.filter((h) => !seen.has(h.date) && seen.add(h.date)); }

/** Gesetzliche Feiertage eines Jahres am Standort, sortiert nach Datum. */
export function holidaysFor(location: string | null | undefined, year: number): Holiday[] {
  if (!location || !isLocation(location) || year < 2000 || year > 2100) return [];
  const [country, region = ''] = location.split('-');
  const list = country === 'DE' ? germany(region, year) : country === 'AT' ? austria(region, year) : country === 'CH' ? switzerland(region, year) : country === 'CN' ? china(year) : country === 'SG' ? singapore(year) : country === 'AE' ? emirates(year) : [];
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
/** Ausgleichs-Arbeitstage eines Jahres am Standort: Wochenendtage, an denen gearbeitet wird. Bisher nur China. */
export function makeupDaysFor(location: string | null | undefined, year: number): Holiday[] {
  if (!location || !isLocation(location)) return [];
  return (PLANS[location.split('-')[0]]?.[year]?.work ?? []).map((day) => ({ date: `${year}-${day}`, name: CN.makeup }));
}
/** Ausgleichs-Arbeitstage im Zeitraum (inklusive), als Map Datum → Name. */
export function makeupDaysBetween(location: string | null | undefined, from: string, to: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!location || from > to) return result;
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of makeupDaysFor(location, year)) if (h.date >= from && h.date <= to) result.set(h.date, h.name);
  }
  return result;
}
/** Name eines Standorts: der Firmenstandort, sonst die Region. */
export function locationName(code: string | null | undefined): string { return OFFICES.find((o) => o.code === code)?.name ?? LOCATIONS.find((l) => l.code === code)?.name ?? code ?? ''; }
