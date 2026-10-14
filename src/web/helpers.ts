import { hasTranslation, localeTag, translate, type Locale } from '../shared/i18n';
import { getLocale } from './i18n';
import type { Membership, Project, TimeEntry } from '../shared/types';

export const roleNames = { owner: 'Inhaber:in', manager: 'Leitung', member: 'Mitglied', disabled: 'Deaktiviert' };
export const statusNames = { draft: 'Entwurf', submitted: 'Eingereicht', approved: 'Freigegeben', active: 'Aktiv', paused: 'Pausiert', archived: 'Archiviert', todo: 'Offen', doing: 'In Arbeit', done: 'Erledigt' };
export function minutesLabel(minutes: number, locale: Locale = getLocale()) { const n = Math.max(0, Math.round(minutes)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} ${locale === 'zh' ? '小时' : 'h'}`; }
export function dateInZone(timezone: string, date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
export function addDays(iso: string, days: number) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
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
  if (!safe && /^Bitte Eingaben prüfen:/.test(message)) safe = 'Bitte Eingaben prüfen.';
  if (!safe && hasTranslation(message)) safe = message;
  return translate(safe || 'Das hat nicht geklappt. Bitte erneut versuchen.', locale);
}
export function csvCell(value: unknown) { const original = String(value ?? ''); const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(original) || /^[\t\r\n]/.test(original) ? `'${original}` : original; return `"${safe.replaceAll('"', '""')}"`; }
export function entriesCsv(entries: TimeEntry[], projects: Project[], members: Membership[], locale: Locale = getLocale()) {
  const rows: unknown[][] = [['Datum', 'Person', 'Projektcode', 'Projekt', 'Kunde', 'Minuten', 'Stunden', 'Beschreibung', 'Abrechenbar', 'Status'].map(label => translate(label, locale))];
  for (const e of entries) { const p = projects.find(p => p.id === e.project_id); const m = members.find(m => m.user_id === e.user_id); rows.push([e.work_date, m?.display_name || m?.email || e.user_id, p?.code ?? '', p?.name ?? '', p?.client ?? '', e.minutes, new Intl.NumberFormat(localeTag(locale), { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(e.minutes / 60), e.note, translate(e.billable ? 'Ja' : 'Nein', locale), translate(statusNames[e.status], locale)]); }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function downloadCsv(content: string, filename: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
// App-relative URLs that survive a base-path deployment (GitHub Pages serves
// the app under /vave.log/): appPath for same-origin routing and history
// entries, appHref for absolute links built from the configured app URL.
export function appPath(relative = '') { return import.meta.env.BASE_URL + relative.replace(/^\//, ''); }
export function appHref(relative: string, appUrl: string) { return new URL(relative.replace(/^\//, ''), appUrl.replace(/\/*$/, '/')).href; }
export function safeRedirect(url: string) { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Die Weiterleitungsadresse wird nicht unterstützt.'); window.location.assign(parsed.href); }
