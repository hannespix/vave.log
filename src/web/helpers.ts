import { hasTranslation, localeTag, translate, type Locale } from '../shared/i18n';
import { getLocale } from './i18n';
import { holidaysBetween } from '../shared/holidays';
import { effectiveSchedule, dayTarget } from '../shared/schedule';
import type { Membership, Project, TimeEntry } from '../shared/types';
import type { Invoice } from '../shared/finance-types';

export const roleNames = { owner: 'Inhaber:in', manager: 'Leitung', member: 'Mitglied', disabled: 'Deaktiviert' };
export const statusNames = { draft: 'Entwurf', submitted: 'Eingereicht', approved: 'Freigegeben', active: 'Aktiv', paused: 'Pausiert', archived: 'Archiviert', todo: 'Offen', doing: 'In Arbeit', done: 'Erledigt' };
export function minutesLabel(minutes: number, locale: Locale = getLocale()) { const n = Math.max(0, Math.round(minutes)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} ${locale === 'zh' ? '小时' : 'h'}`; }
/** Diakritika-tolerante Suchnormalisierung (ä→a, ß→ss), geteilt von SelectMenu und Listen-Suchen. */
export function fold(text: string) { return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replaceAll('ß', 'ss').toLowerCase(); }
export type PaletteEntry = { id: string; kind: 'area'|'project'|'task'|'person'|'invoice'|'help'; title: string; subtitle?: string; keywords: string };
/** Rechnung als Suchtreffer: Nummer (oder Entwurf) und Kunde im Titel, Status · Betrag · Datum darunter; Projekt nur als Suchbegriff. */
export function invoiceSearchEntry(invoice: Invoice, project: Project | undefined, locale: Locale = getLocale()): PaletteEntry {
  const client = invoice.customer_snapshot?.name ?? '';
  const status = translate(invoice.status === 'cancellation' ? 'Storno' : invoice.status === 'draft' ? 'Entwurf' : invoice.paid ? 'Bezahlt' : 'Unbezahlt', locale);
  const format = new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency: invoice.currency });
  const amount = format.format(invoice.total_minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
  return {
    id: `invoice:${invoice.id}`, kind: 'invoice',
    title: [invoice.number ?? translate('Entwurf', locale), client].filter(Boolean).join(' · '),
    subtitle: [status, amount, invoice.issue_date ? shortDate(invoice.issue_date, locale) : ''].filter(Boolean).join(' · '),
    keywords: `${invoice.number ?? ''} ${client} ${project?.code ?? ''} ${project?.name ?? ''} ${status} ${amount} ${translate('Rechnung', locale)} invoice`,
  };
}
/** Globale Suche: jeder Begriff muss treffen (UND, Reihenfolge egal); Präfix schlägt Wortanfang schlägt Teiltreffer. Ohne Eingabe nur die Bereiche. */
export function searchPalette<T extends PaletteEntry>(items: T[], query: string, limit = 12): T[] {
  const tokens = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items.filter(item => item.kind === 'area').slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const hay = fold(`${item.title} ${item.subtitle ?? ''} ${item.keywords}`);
    let score = 0; let ok = true;
    for (const token of tokens) {
      const at = hay.indexOf(token);
      if (at < 0) { ok = false; break; }
      score += at === 0 ? 3 : /[^\p{L}\p{N}]/u.test(hay[at - 1] ?? ' ') ? 2 : 1;
    }
    if (ok) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'de')).slice(0, limit).map(s => s.item);
}
export type MemberSort = 'name' | 'name_desc' | 'role' | 'capacity';
export type MemberRoleFilter = 'all' | 'active' | Membership['role'];
const roleRank: Record<Membership['role'], number> = { owner: 0, manager: 1, member: 2, disabled: 3 };
/** Team-Liste: Suche über Name, E-Mail, Rolle und Demo-Angaben (jeder Begriff muss treffen), Rollenfilter, Sortierung. Gleichstände nach Name. */
export function filterMembers(members: Membership[], opts: { query: string; role: MemberRoleFilter; sort: MemberSort }, locale: Locale = getLocale()): Membership[] {
  const tokens = fold(opts.query.trim()).split(/\s+/).filter(Boolean);
  const nameOf = (m: Membership) => m.display_name || m.email || '';
  const byName = (a: Membership, b: Membership) => nameOf(a).localeCompare(nameOf(b), localeTag(locale), { sensitivity: 'base' });
  const list = members.filter(m => {
    if (opts.role === 'active' ? m.role === 'disabled' : opts.role !== 'all' && m.role !== opts.role) return false;
    if (tokens.length === 0) return true;
    const hay = fold([m.display_name, m.is_demo ? '' : m.email, translate(roleNames[m.role], locale), m.demo_title, m.demo_studio].filter(Boolean).join(' '));
    return tokens.every(token => hay.includes(token));
  });
  const compare: Record<MemberSort, (a: Membership, b: Membership) => number> = {
    name: byName,
    name_desc: (a, b) => byName(b, a),
    role: (a, b) => roleRank[a.role] - roleRank[b.role] || byName(a, b),
    // Gepflegte Kapazität zuerst (absteigend), nicht gepflegte ans Ende.
    capacity: (a, b) => (b.weekly_capacity_minutes ?? -1) - (a.weekly_capacity_minutes ?? -1) || byName(a, b),
  };
  return list.sort(compare[opts.sort]);
}
export function dateInZone(timezone: string, date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
export function addDays(iso: string, days: number) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
/** Werktage Mo–Fr im inklusiven Bereich (Feiertage zählen als Werktag — die pflegt das Team als Abwesenheit der Art „Feiertag"). */
export function countWorkdays(from: string, to: string) {
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); if (dow >= 1 && dow <= 5) count++; }
  return count;
}
export interface MemberUtilization { capacityMinutes: number | null; absenceWorkdays: number; holidayWorkdays: number; expectedMinutes: number | null; actualMinutes: number; billableMinutes: number }
/** Soll je Person = Summe der Tagessolls aus dem Arbeitszeitmodell (ohne Modell: Kapazität/5 auf Mo–Fr), 0 an eingetragenen Abwesenheiten (tagesgenau dedupliziert, halbe Tage halb) und an gesetzlichen Feiertagen des Standorts (sonst Workspace-Standard). Kapazität null heißt Soll unbekannt, nie 0. */
export function utilization(members: Membership[], entries: TimeEntry[], absences: { user_id: string; starts_on: string; ends_on: string; half_day?: '' | 'am' | 'pm' }[], range: { from: string; to: string }, defaultLocation: string | null = null) {
  const result = new Map<string, MemberUtilization>();
  for (const member of members) {
    if (member.role === 'disabled') continue;
    const schedule = effectiveSchedule(member);
    const absent = new Map<string, '' | 'am' | 'pm'>();
    for (const absence of absences) {
      if (absence.user_id !== member.user_id) continue;
      const from = absence.starts_on < range.from ? range.from : absence.starts_on, to = absence.ends_on > range.to ? range.to : absence.ends_on;
      for (let day = from; day <= to; day = addDays(day, 1)) { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); if (dow >= 1 && dow <= 5) absent.set(day, absent.get(day) === '' ? '' : (absence.half_day ?? '')); }
    }
    const holidays = holidaysBetween(member.location ?? defaultLocation, range.from, range.to);
    let holidayWorkdays = 0, expected = 0;
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (holidays.has(day) && dow >= 1 && dow <= 5 && !absent.has(day)) holidayWorkdays++;
      const half = absent.get(day);
      expected += dayTarget(schedule, day, holidays.get(day), absent.has(day) ? { user_id: member.user_id, starts_on: day, ends_on: day, kind: 'other', status: 'approved', half_day: half } : null) ?? 0;
    }
    const own = entries.filter(entry => entry.user_id === member.user_id);
    result.set(member.user_id, {
      capacityMinutes: member.weekly_capacity_minutes ?? null,
      absenceWorkdays: absent.size,
      holidayWorkdays,
      expectedMinutes: schedule ? expected : null,
      actualMinutes: own.reduce((total, entry) => total + entry.minutes, 0),
      billableMinutes: own.filter(entry => entry.billable).reduce((total, entry) => total + entry.minutes, 0),
    });
  }
  return result;
}
export function weekFor(iso: string) { const day = new Date(`${iso}T12:00:00Z`).getUTCDay(); const from = addDays(iso, -(day === 0 ? 6 : day - 1)); return { from, to: addDays(from, 6) }; }
export function validRange(from: string, to: string) { const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '2000-01-01' && s <= '2100-12-31' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; if (!valid(from) || !valid(to)) return false; const a = Date.parse(from), b = Date.parse(to); return b >= a && b - a <= 365 * 86400000; }
function calendarDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date : null;
}
export function shortDate(iso: string, locale: Locale = getLocale()) {
  const date = calendarDate(iso);
  return date ? new Intl.DateTimeFormat(localeTag(locale), { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date) : '–';
}
export function longDate(iso: string, locale: Locale = getLocale()) {
  const date = calendarDate(iso);
  return date ? new Intl.DateTimeFormat(localeTag(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date) : translate('Ungültiges Datum', locale);
}
/** Schriftfarbe mit dem höheren Kontrast (WCAG) auf einer beliebigen Hex-Hintergrundfarbe, z. B. Projektfarben. */
export function readableTextOn(background: string): '#ffffff' | '#1b1b1b' {
  const hex = /^#?([0-9a-f]{6})$/i.exec(background.trim())?.[1];
  if (!hex) return '#ffffff';
  const channel = (offset: number) => { const c = parseInt(hex.slice(offset, offset + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  const onWhite = 1.05 / (lum + 0.05), onDark = (lum + 0.05) / (0.0109 + 0.05);
  return onWhite >= onDark ? '#ffffff' : '#1b1b1b';
}
export function initials(name: string) { return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase(); }
export function errorMessage(error: unknown, locale: Locale = getLocale()): string {
  const value = error && typeof error === 'object' ? error as {code?: unknown; message?: unknown} : {};
  const message = typeof value.message === 'string' ? value.message : '';
  const code = typeof value.code === 'string' ? value.code : '';
  const byCode: Record<string, string> = { '42501': 'Dafür fehlt die Berechtigung.', '23503': 'Projekt, Person oder Workspace passen nicht zusammen.', '23505': 'Dieser Eintrag existiert bereits. Bitte den aktuellen Stand laden.', '23514': 'Diese Änderung verletzt eine Datenregel. Bitte Eingaben prüfen.', PGRST116: 'Eintrag nicht gefunden oder kein Zugriff.', PGRST301: 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.', PGRST205: 'Die Datenbank ist noch nicht eingerichtet. Bitte die Migration anwenden.', validation: 'Bitte Eingaben prüfen.' };
  let safe = byCode[code];
  if (!safe && /invalid login credentials/i.test(message)) safe = 'E-Mail oder Passwort stimmt nicht.';
  if (!safe && /email not confirmed/i.test(message)) safe = 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (!safe && /rate limit|too many requests/i.test(message)) safe = 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
  if (!safe && /user already registered|email.*already.*registered/i.test(message)) safe = 'Ein Account mit dieser E-Mail-Adresse existiert bereits.';
  if (!safe && /password.*(least|weak|short|requirement)/i.test(message)) safe = 'Das Passwort erfüllt die Sicherheitsanforderungen nicht.';
  if (!safe && message.startsWith('Bitte Eingaben prüfen:')) safe = 'Bitte Eingaben prüfen.';
  if (!safe && hasTranslation(message)) safe = message;
  return translate(safe || 'Das hat nicht geklappt. Bitte erneut versuchen.', locale);
}
// oxlint-disable-next-line no-control-regex -- CSV-Injection-Schutz prüft bewusst auf Steuerzeichen.
export function csvCell(value: unknown) { const original = String(value ?? ''); const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(original) || /^[\t\r\n]/.test(original) ? `'${original}` : original; return `"${safe.replaceAll('"', '""')}"`; }
export function entriesCsv(entries: TimeEntry[], projects: Project[], members: Membership[], locale: Locale = getLocale()) {
  const rows: unknown[][] = [['Datum', 'Person', 'Projektcode', 'Projekt', 'Kunde', 'Minuten', 'Stunden', 'Beschreibung', 'Abrechenbar', 'Status'].map(label => translate(label, locale))];
  for (const e of entries) { const p = projects.find(p => p.id === e.project_id); const m = members.find(m => m.user_id === e.user_id); rows.push([e.work_date, m?.display_name || m?.email || e.user_id, p?.code ?? '', p?.name ?? '', p?.client ?? '', e.minutes, new Intl.NumberFormat(localeTag(locale), { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(e.minutes / 60), e.note, translate(e.billable ? 'Ja' : 'Nein', locale), translate(statusNames[e.status], locale)]); }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function downloadText(filename: string, value: string, type = 'text/csv;charset=utf-8') { const url = URL.createObjectURL(new Blob([value], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function downloadCsv(content: string, filename: string) { downloadText(filename, content); }
// App-relative URLs that survive a base-path deployment (GitHub Pages serves
// the app under /vave.log/): appPath for same-origin routing and history
// entries, appHref for absolute links built from the configured app URL.
export function appPath(relative = '') { return import.meta.env.BASE_URL + relative.replace(/^\//, ''); }
export function appHref(relative: string, appUrl: string) { return new URL(relative.replace(/^\//, ''), appUrl.replace(/\/*$/, '/')).href; }
export function safeRedirect(url: string) { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Die Weiterleitungsadresse wird nicht unterstützt.'); window.location.assign(parsed.href); }

export const AUTH_LINK_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
export type AuthLinkType = typeof AUTH_LINK_TYPES[number];
export interface AuthLink { tokenHash: string; type: AuthLinkType | ''; reset: boolean; errorCode: string; errorDescription: string }
/** Liest Auth-Parameter aus der Adresse: Token-Hash-Links der E-Mail-Vorlagen (`?token_hash=…&type=…`), `?reset=1` und Supabase-Fehlerrückleitungen (`error_code`/`error_description` in Query oder Hash). */
export function parseAuthLink(search: string, hash: string): AuthLink {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const pick = (key: string) => query.get(key) ?? fragment.get(key) ?? '';
  const type = pick('type');
  return {
    tokenHash: pick('token_hash').slice(0, 200),
    type: (AUTH_LINK_TYPES as readonly string[]).includes(type) ? type as AuthLinkType : '',
    reset: query.get('reset') === '1',
    errorCode: pick('error_code').slice(0, 80),
    errorDescription: pick('error_description').slice(0, 300),
  };
}
/** Adresse ohne Auth-Parameter – was nach dem Verarbeiten eines Links in der Leiste stehen bleibt. */
export function stripAuthLink(search: string, hash: string): string {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of ['token_hash', 'type', 'error', 'error_code', 'error_description', 'code']) query.delete(key);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const keepHash = fragment.has('w') && !fragment.has('error') && !fragment.has('access_token');
  const rest = query.toString();
  return `${appPath()}${rest ? `?${rest}` : ''}${keepHash ? hash : ''}`;
}
