import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, CalendarClock, Check, ChevronLeft, ChevronRight, PartyPopper, Palmtree, Pencil, Plus, Send, Thermometer, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Absence, Membership, VacationBalance, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { holidaysBetween, locationName, makeupDaysBetween, planKnown } from '../shared/holidays';
import { absenceStatus, absenceWorkdays, absencesIcs, absentPerDay, monthDays, vacationSummary, type VacationSummary } from '../shared/vacation';
import { Empty, Field, Notice } from './components';
import { useI18n } from './i18n';
import { downloadText, initials, longDate } from './helpers';
import { SelectMenu } from './select-menu';
import { RangeCalendar, monthOfDay, type DayInfo } from './range-calendar';
import './absences.css';

export const ABSENCE_KINDS = { vacation: 'Urlaub', sick: 'Krank', holiday: 'Feiertag', other: 'Sonstiges' } as const;
export const ABSENCE_STATUS = { requested: 'Beantragt', approved: 'Genehmigt', declined: 'Abgelehnt' } as const;
const KIND_ICONS = { vacation: Palmtree, sick: Thermometer, holiday: PartyPopper, other: CalendarClock } as const;
type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Confirm = (options: { title: string; text: string; label: string; action: () => Promise<unknown>; success?: string }) => void;
interface Props { members: Membership[]; workspace: Workspace; userId: string; canManage: boolean; /** Recht „Abwesenheiten im Team: Sehen“ – zeigt die Urlaubskonten aller, ohne sie bearbeiten zu können. */ canView?: boolean; service: Service; run: Run; busy: boolean; confirm: Confirm; today: string; reloadKey: unknown }

const monthOf = (day: string) => day.slice(0, 7);
const shiftMonth = (month: string, by: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const num = (value: string) => { const n = Number(value.replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 2) / 2 : 0; };
const fmtDays = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);

/** Urlaubskonto als Balken: genommen, beantragt, frei – als Anteile des Jahresanspruchs samt Übertrag und Korrektur. */
function VacationBar({ summary, preview = 0, label }: { summary: VacationSummary; preview?: number; label: string }) {
  const total = Math.max(0, (summary.entitlement ?? 0) + summary.carriedOver + summary.adjustment);
  const base = Math.max(total, summary.taken + summary.requested + preview, 1);
  const share = (n: number) => `${Math.max(0, n) / base * 100}%`;
  return <div className="vac-bar" role="img" aria-label={label}>
    <span className="vac-taken" style={{ width: share(summary.taken) }}/><span className="vac-requested" style={{ width: share(summary.requested) }}/>{preview > 0 && <span className="vac-preview" style={{ width: share(preview) }}/>}
  </div>;
}

/** Bereich „Abwesenheiten“: das eigene Urlaubskonto, der Antrag mit Kalender, der Teamkalender, Freigaben und Konten. */
export function AbsencesArea({ members, workspace, userId, canManage, canView = false, service, run, busy, confirm, today, reloadKey }: Props) {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(monthOf(today));
  const year = Number(month.slice(0, 4));
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [balances, setBalances] = useState<VacationBalance[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ person: userId, kind: 'vacation' as Absence['kind'], from: today, to: today, half: '' as '' | 'am' | 'pm', note: '' });
  const [pickMonth, setPickMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState('');
  // Im Teamkalender über Tage ziehen wählt Person und Zeitraum und öffnet den Antrag damit.
  const [pick, setPick] = useState<{ user: string; a: string; b: string } | null>(null);
  const picking = useRef<{ user: string; a: string; b: string } | null>(null); const formRef = useRef<HTMLFormElement>(null);
  const mayEnterFor = (id: string) => canManage || id === userId;
  const cellAt = (e: ReactPointerEvent<HTMLElement>) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('td[data-day]') ?? null;
  const reveal = () => window.setTimeout(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  const open = (change: Partial<typeof form> = {}) => { const next = { ...form, ...change }; setForm(next); setPickMonth(monthOfDay(next.from)); setAdding(true); reveal(); };
  function pickStart(e: ReactPointerEvent<HTMLTableSectionElement>) {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('td[data-day]');
    if (!cell || busy || e.button !== 0 || !mayEnterFor(cell.dataset.user!)) return;
    // Mit dem Finger wird hier gescrollt; ein Tipp wählt den einzelnen Tag (siehe pickEnd).
    picking.current = { user: cell.dataset.user!, a: cell.dataset.day!, b: cell.dataset.day! };
    if (e.pointerType !== 'touch') { e.currentTarget.setPointerCapture(e.pointerId); setPick(picking.current); e.preventDefault(); }
  }
  function pickMove(e: ReactPointerEvent<HTMLTableSectionElement>) {
    const p = picking.current; if (!p || e.pointerType === 'touch') return;
    const day = cellAt(e)?.dataset.day;
    if (day && day !== p.b) { picking.current = { ...p, b: day }; setPick(picking.current); }
  }
  function pickEnd(e: ReactPointerEvent<HTMLTableSectionElement>) {
    const p = picking.current; picking.current = null; setPick(null);
    if (!p) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (e.pointerType === 'touch' && cellAt(e)?.dataset.day !== p.a) return; // gescrollt, nicht getippt
    const from = p.a < p.b ? p.a : p.b, to = p.a < p.b ? p.b : p.a;
    open({ person: p.user, from, to, half: from === to ? form.half : '' });
  }
  const picked = (user: string, day: string) => !!pick && pick.user === user && day >= (pick.a < pick.b ? pick.a : pick.b) && day <= (pick.a < pick.b ? pick.b : pick.a);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => Promise.all([service.listAbsences(workspace.id, `${year}-01-01`, `${year}-12-31`), service.listVacationBalances(workspace.id, year)]))
      .then(([list, bal]) => { if (alive) { setAbsences(list); setBalances(bal); } })
      .catch(() => { if (alive) { setAbsences([]); setBalances([]); } });
    return () => { alive = false; };
  }, [service, workspace.id, year, reloadKey]);

  const team = members.filter((m) => m.role !== 'disabled');
  const self = members.find((m) => m.user_id === userId);
  const name = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.display_name || m?.email || t('Teammitglied'); };
  const location = (m: Membership | undefined) => m?.location ?? workspace.default_location ?? null;
  const list = absences ?? [];
  const days = monthDays(year, Number(month.slice(5, 7)));
  const holidayCache = new Map<string, Map<string, string>>();
  const holidays = (loc: string | null) => { const key = loc ?? ''; let map = holidayCache.get(key); if (!map) { map = holidaysBetween(loc, days[0], days[days.length - 1]); holidayCache.set(key, map); } return map; };
  const makeupCache = new Map<string, Map<string, string>>();
  const makeupDays = (loc: string | null) => { const key = loc ?? ''; let map = makeupCache.get(key); if (!map) { map = makeupDaysBetween(loc, days[0], days[days.length - 1]); makeupCache.set(key, map); } return map; };
  const provisional = [...new Set(team.map((m) => location(m)).filter((loc): loc is string => !!loc && !planKnown(loc, year)))].map(locationName);
  const hasMakeup = team.some((m) => makeupDays(location(m)).size > 0);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`));
  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const requests = list.filter((a) => absenceStatus(a) === 'requested').sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const balance = (id: string) => balances.find((b) => b.user_id === id);
  const summary = (m: Membership) => { const b = balance(m.user_id); return vacationSummary({ entitlement: m.vacation_days_per_year == null ? null : Number(m.vacation_days_per_year), carriedOver: Number(b?.carried_over ?? 0), adjustment: Number(b?.adjustment ?? 0), absences: list, userId: m.user_id, year, location: location(m), schedule: m.work_schedule ?? null }); };
  const period = (a: { starts_on: string; ends_on: string }) => a.starts_on === a.ends_on ? longDate(a.starts_on) : `${longDate(a.starts_on)} – ${longDate(a.ends_on)}`;
  const workdays = (a: Absence, m: Membership | undefined) => absenceWorkdays(a, location(m), undefined, undefined, m?.work_schedule ?? null);
  const barLabel = (s: VacationSummary) => t('{taken} genommen, {requested} beantragt, {remaining} frei', { taken: fmtDays(s.taken, locale), requested: fmtDays(s.requested, locale), remaining: s.remaining == null ? '–' : fmtDays(s.remaining, locale) });

  const formMember = members.find((m) => m.user_id === form.person);
  const valid = form.from <= form.to;
  const formDays = valid ? absenceWorkdays({ user_id: form.person, starts_on: form.from, ends_on: form.to, kind: form.kind, half_day: form.from === form.to ? form.half : '' }, location(formMember), undefined, undefined, formMember?.work_schedule ?? null) : 0;
  const formSummary = formMember ? summary(formMember) : null;
  const away = valid ? [...new Set(list.filter((a) => a.user_id !== form.person && absenceStatus(a) !== 'declined' && a.starts_on <= form.to && a.ends_on >= form.from).map((a) => a.user_id))] : [];
  const needsApproval = workspace.absence_approval !== false && form.kind !== 'sick' && !canManage;
  // Für den Zeitraum-Kalender: Feiertage am Standort der Person, ihre bestehenden Einträge und wer sonst weg ist.
  const pickFrom = `${pickMonth}-01`, pickTo = shiftMonth(pickMonth, 2) + '-01';
  const pickHolidays = holidaysBetween(location(formMember), pickFrom, pickTo), pickMakeup = makeupDaysBetween(location(formMember), pickFrom, pickTo);
  const othersAway = absentPerDay(list.filter((a) => a.user_id !== form.person), pickFrom, pickTo);
  const dayInfo = (day: string): DayInfo => {
    const own = list.find((a) => a.user_id === form.person && absenceStatus(a) !== 'declined' && a.starts_on <= day && a.ends_on >= day);
    const index = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7, schedule = formMember?.work_schedule;
    return { holiday: pickHolidays.get(day), makeup: pickMakeup.get(day), own: own ? t(ABSENCE_KINDS[own.kind]) : undefined, others: othersAway.get(day)?.size, off: Array.isArray(schedule) && schedule.length === 7 && !schedule[index] && !pickMakeup.has(day) };
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    void run(() => service.saveAbsence({ workspace_id: workspace.id, user_id: form.person, starts_on: form.from, ends_on: form.to, kind: form.kind, note: form.note.trim(), half_day: form.from === form.to ? form.half : '' }), needsApproval ? t('Antrag gestellt. Die Leitung entscheidet.') : t('Abwesenheit eingetragen.')).then((ok) => { if (ok) { setAdding(false); setForm((f) => ({ ...f, note: '', half: '' })); } });
  }
  const exportIcs = () => downloadText(`vave-log-abwesenheiten-${year}.ics`, absencesIcs(list, name, { vacation: t(ABSENCE_KINDS.vacation), sick: t(ABSENCE_KINDS.sick), holiday: t(ABSENCE_KINDS.holiday), other: t(ABSENCE_KINDS.other) }), 'text/calendar;charset=utf-8');
  const canDelete = (a: Absence) => canManage || (a.user_id === userId && (absenceStatus(a) === 'requested' || a.kind === 'sick'));
  const remove = (a: Absence) => confirm({ title: t('Abwesenheit löschen?'), text: t('Der Eintrag wird dauerhaft entfernt.'), label: t('Abwesenheit löschen'), action: () => service.deleteAbsence(a.id), success: t('Abwesenheit gelöscht.') });
  const mine = list.filter((a) => a.user_id === userId).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const upcoming = list.filter((a) => absenceStatus(a) === 'approved' && a.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(0, 4);
  const own = self ? summary(self) : null;
  const ownTotal = own ? (own.entitlement ?? 0) + own.carriedOver + own.adjustment : 0;
  const avatar = (m: Membership | undefined, id: string) => <span className="avatar tiny-avatar" aria-hidden="true">{initials(m?.display_name || m?.email || name(id))}</span>;

  return <div className="absence-stack">
    <div className="absence-top">
      <section className="panel vac-card" aria-label={t('Dein Urlaub {year}', { year: String(year) })}>
        <p className="eyebrow">{t('DEIN URLAUB {year}', { year: String(year) })}</p>
        {own && own.remaining != null ? <>
          <div className="vac-figure"><strong className={own.remaining < 0 ? 'overdue' : ''}>{fmtDays(own.remaining, locale)}</strong><span>{t('Tage frei')}</span></div>
          <VacationBar summary={own} label={barLabel(own)}/>
          <ul className="vac-legend"><li><i className="vac-key vac-taken"/>{t('{days} genommen', { days: fmtDays(own.taken, locale) })}</li><li><i className="vac-key vac-requested"/>{t('{days} beantragt', { days: fmtDays(own.requested, locale) })}</li><li><i className="vac-key vac-free"/>{t('{days} frei', { days: fmtDays(own.remaining, locale) })}</li></ul>
          <p className="muted vac-total">{t('Anspruch {days} Tage', { days: fmtDays(ownTotal, locale) })}{own.carriedOver ? ` · ${t('davon {days} Übertrag', { days: fmtDays(own.carriedOver, locale) })}` : ''}</p>
        </> : <p className="muted vac-empty">{t('Dein Urlaubsanspruch ist noch nicht hinterlegt. Die Leitung trägt ihn im Urlaubskonto ein.')}</p>}
        <div className="vac-actions"><button className="button primary" onClick={() => adding ? setAdding(false) : open({ person: canManage ? form.person : userId, kind: 'vacation' })} aria-expanded={adding}><Plus size={16}/> {canManage ? t('Abwesenheit eintragen') : t('Urlaub beantragen')}</button>
          <button className="button secondary" onClick={() => open({ person: userId, kind: 'sick', from: today, to: today, half: '' })}><Thermometer size={15}/> {t('Krank melden')}</button></div>
      </section>
      {canManage && requests.length > 0
        ? <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('OFFENE ANTRÄGE')}</p><h2>{t('Das wartet auf deine Entscheidung.')}</h2></div><span className="count-circle">{requests.length}</span></div>
          <div className="request-list">{requests.map((a) => { const m = members.find((x) => x.user_id === a.user_id); const s = m ? summary(m) : null; const others = [...new Set(list.filter((o) => o.user_id !== a.user_id && absenceStatus(o) !== 'declined' && o.starts_on <= a.ends_on && o.ends_on >= a.starts_on).map((o) => o.user_id))];
            return <article className="request-card absence-request" key={a.id}>
              <div className="request-who">{avatar(m, a.user_id)}<div><strong>{name(a.user_id)}</strong><small>{t(ABSENCE_KINDS[a.kind])} · {period(a)}{a.half_day && <> · {t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}</>}</small></div></div>
              <div className="request-facts"><span className="fact-chip">{t('{days} Arbeitstage', { days: fmtDays(workdays(a, m), locale) })}</span>{a.kind === 'vacation' && s?.remaining != null && <span className="fact-chip">{t('Rest danach: {days} Tage', { days: fmtDays(s.remaining, locale) })}</span>}{others.length > 0 && <span className="fact-chip fact-warn"><TriangleAlert size={12}/> {t('{count} weitere Personen sind in dieser Zeit weg', { count: others.length })}</span>}</div>
              {a.note && <p className="request-note">{a.note}</p>}
              <div className="button-row"><button className="button primary small" disabled={busy} onClick={() => void run(() => service.decideAbsence({ id: a.id, approve: true }), t('Antrag genehmigt.'))}><Check size={14}/> {t('Genehmigen')}</button><button className="button secondary small" disabled={busy} onClick={() => confirm({ title: t('Antrag ablehnen?'), text: t('{name} wird benachrichtigt. Der Antrag bleibt als abgelehnt sichtbar.', { name: name(a.user_id) }), label: t('Ablehnen'), action: () => service.decideAbsence({ id: a.id, approve: false }), success: t('Antrag abgelehnt.') })}><X size={14}/> {t('Ablehnen')}</button></div>
            </article>; })}</div></section>
        : <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('ALS NÄCHSTES')}</p><h2>{t('Wer ist bald weg.')}</h2></div></div>
          {upcoming.length === 0 ? <p className="muted">{t('In nächster Zeit ist niemand abwesend.')}</p> : <ul className="upcoming-list">{upcoming.map((a) => { const m = members.find((x) => x.user_id === a.user_id); const Icon = KIND_ICONS[a.kind]; return <li key={a.id}>{avatar(m, a.user_id)}<div><strong>{name(a.user_id)}</strong><small>{period(a)}</small></div><span className={`kind-chip kind-${a.kind}`}><Icon size={12}/> {t(ABSENCE_KINDS[a.kind])}</span></li>; })}</ul>}</section>}
    </div>

    {adding && <section className="panel absence-composer"><form ref={formRef} className="absence-form" onSubmit={submit}>
      <div className="composer-main">
        <div className="panel-heading"><div><p className="eyebrow">{needsApproval ? t('NEUER ANTRAG') : t('NEUER EINTRAG')}</p><h2>{t('Wann bist du weg?')}</h2></div><button type="button" className="icon-button" onClick={() => setAdding(false)} aria-label={t('Schließen')}><X size={18}/></button></div>
        {canManage && <Field label={t('Person')}><SelectMenu label={t('Person')} value={form.person} onChange={(person) => setForm((f) => ({ ...f, person }))} options={team.map((m) => ({ value: m.user_id, label: m.display_name || m.email }))}/></Field>}
        <div className="kind-pills" role="radiogroup" aria-label={t('Art')}>{(Object.keys(ABSENCE_KINDS) as Absence['kind'][]).filter((k) => k !== 'holiday' || canManage).map((k) => { const Icon = KIND_ICONS[k]; return <button type="button" key={k} role="radio" aria-checked={form.kind === k} className={`kind-pill kind-${k}${form.kind === k ? ' selected' : ''}`} onClick={() => setForm((f) => ({ ...f, kind: k }))}><Icon size={16}/> {t(ABSENCE_KINDS[k])}</button>; })}</div>
        <RangeCalendar label={t('Zeitraum wählen')} from={form.from} to={form.to} today={today} month={pickMonth} onMonth={setPickMonth} info={dayInfo} disabled={busy} onChange={(from, to) => setForm((f) => ({ ...f, from, to, half: from === to ? f.half : '' }))}/>
        <div className="composer-dates"><Field label={t('Von')}><input type="date" required value={form.from} min="2000-01-01" max="2100-12-31" onChange={(e) => { const from = e.target.value; setForm((f) => ({ ...f, from, to: f.to < from ? from : f.to })); if (from) setPickMonth(monthOfDay(from)); }}/></Field><Field label={t('Bis')}><input type="date" required value={form.to} min={form.from} max="2100-12-31" onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}/></Field></div>
      </div>
      <aside className="composer-side">
        <p className="eyebrow">{t('ZUSAMMENFASSUNG')}</p>
        <p className="composer-range">{valid ? (form.from === form.to ? longDate(form.from) : `${longDate(form.from)} – ${longDate(form.to)}`) : t('Das Ende liegt vor dem Beginn.')}</p>
        <div className="composer-count" aria-hidden="true"><strong>{fmtDays(formDays, locale)}</strong><span>{t('Arbeitstage', { count: formDays })}</span></div>
        <p className="absence-preview" aria-live="polite">{!valid ? t('Das Ende liegt vor dem Beginn.') : t('Zählt {days} Arbeitstage', { days: fmtDays(formDays, locale) })}{form.kind === 'vacation' && formSummary?.remaining != null && valid && <> · {t('Rest danach: {days} Tage', { days: fmtDays(formSummary.remaining - formDays, locale) })}</>}</p>
        {form.kind === 'vacation' && formSummary && formSummary.remaining != null && valid && <VacationBar summary={formSummary} preview={formDays} label={t('Rest danach: {days} Tage', { days: fmtDays(formSummary.remaining - formDays, locale) })}/>}
        {form.from === form.to && <div className="segmented half-day" role="radiogroup" aria-label={t('Halber Tag')}>{([['', 'Ganzer Tag'], ['am', 'Vormittag'], ['pm', 'Nachmittag']] as const).map(([value, label]) => <button type="button" key={value} role="radio" aria-checked={form.half === value} className={form.half === value ? 'selected' : ''} onClick={() => setForm((f) => ({ ...f, half: value }))}>{t(label)}</button>)}</div>}
        {away.length > 0 && <p className="composer-away"><TriangleAlert size={14}/> <span><span className="absence-overlap">{t('{count} weitere Personen sind in dieser Zeit weg', { count: away.length })}</span>: {away.slice(0, 4).map(name).join(', ')}{away.length > 4 ? ' …' : ''}</span></p>}
        <Field label={t('Notiz')}><input value={form.note} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={t('Optional, zum Beispiel: Vertretung ist Mara')}/></Field>
        {needsApproval && <Notice kind="info">{t('Urlaub und sonstige Abwesenheiten gehen als Antrag an die Leitung. Krankmeldungen gelten sofort.')}</Notice>}
        <div className="composer-actions"><button className="button primary" disabled={busy || !valid}>{needsApproval ? <Send size={15}/> : <Check size={15}/>} {needsApproval ? t('Antrag senden') : t('Speichern')}</button><button type="button" className="text-button" onClick={() => setAdding(false)}>{t('Abbrechen')}</button></div>
      </aside>
    </form></section>}

    <section className="panel table-panel team-calendar">
      <div className="team-cal-head">
        <div className="range-controls"><button className="icon-button" aria-label={t('Vorheriger Monat')} disabled={busy} onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={17}/></button><strong className="absence-month" aria-live="polite">{monthLabel}</strong><button className="icon-button" aria-label={t('Nächster Monat')} disabled={busy} onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight size={17}/></button><button className="text-button tiny" onClick={() => setMonth(monthOf(today))}>{t('Heute')}</button></div>
        <span className="absence-legend" aria-hidden="true"><span className="cal-swatch cal-vacation"/>{t('Urlaub')}<span className="cal-swatch cal-vacation cal-requested"/>{t('Beantragt')}<span className="cal-swatch cal-sick"/>{t('Krank')}<span className="cal-swatch cal-other"/>{t('Sonstiges')}<span className="cal-swatch cal-holiday"/>{t('Feiertag')}{hasMakeup && <><span className="cal-swatch cal-makeup"/>{t('Ausgleichs-Arbeitstag')}</>}</span>
        <button className="button secondary small" disabled={!list.some((a) => absenceStatus(a) === 'approved')} onClick={exportIcs}><ArrowDownToLine size={15}/> {t('Kalender (ICS)')}</button>
      </div>
      {absences === null ? <p className="muted absence-loading">{t('Workspace wird aktualisiert …')}</p> : team.length === 0 ? <Empty title={t('Niemand gefunden.')} text={t('Keine Person passt zu Suche und Filter.')}/> : <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Abwesenheitskalender {month}', { month: monthLabel })}><table className="absence-grid" style={{ '--days': days.length } as CSSProperties}><thead><tr><th scope="col">{t('Person')}</th>{days.map((day) => { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); return <th scope="col" key={day} className={`cal-day${dow === 0 || dow === 6 ? ' cal-weekend' : ''}${day === today ? ' cal-today' : ''}`} aria-label={longDate(day)}><span>{weekdayLabel.format(new Date(`${day}T12:00:00Z`)).slice(0, 2)}</span><strong>{Number(day.slice(8))}</strong></th>; })}</tr></thead>
        <tbody onPointerDown={pickStart} onPointerMove={pickMove} onPointerUp={pickEnd} onPointerCancel={() => { picking.current = null; setPick(null); }}>{team.map((m) => { const hol = holidays(location(m)), work = makeupDays(location(m)); return <tr key={m.user_id}><th scope="row"><div className="person-cell">{avatar(m, m.user_id)}<span>{m.display_name || m.email}{m.user_id === userId && <span className="you-label">{t('Du')}</span>}</span></div></th>{days.map((day, i) => {
          const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); const makeup = work.get(day); const weekend = (dow === 0 || dow === 6) && !makeup; const holiday = hol.get(day);
          const a = list.find((x) => x.user_id === m.user_id && x.starts_on <= day && x.ends_on >= day && absenceStatus(x) !== 'declined');
          const label = a ? `${t(ABSENCE_KINDS[a.kind])}${absenceStatus(a) === 'requested' ? ` (${t('Beantragt')})` : ''}${a.half_day ? ` · ${t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}` : ''}` : holiday ?? makeup ?? '';
          const first = !!a && (a.starts_on === day || i === 0), last = !!a && (a.ends_on === day || i === days.length - 1);
          return <td key={day} data-day={day} data-user={m.user_id} className={`cal-cell${mayEnterFor(m.user_id) ? ' cal-pickable' : ''}${picked(m.user_id, day) ? ' cal-pick' : ''}${weekend ? ' cal-weekend' : ''}${holiday ? ' cal-holiday' : ''}${makeup && !holiday ? ' cal-makeup' : ''}${a ? ` cal-${a.kind} cal-${absenceStatus(a)}${a.half_day ? ` cal-half cal-${a.half_day}` : ''}${first ? ' cal-first' : ''}${last ? ' cal-last' : ''}` : ''}${day === today ? ' cal-today' : ''}`} title={label ? `${longDate(day)}: ${label}` : undefined}>{a && <span className="cal-bar" aria-hidden="true"/>}{label && <span className="sr-only">{longDate(day)}: {label}</span>}</td>; })}</tr>; })}</tbody></table></div>}
      <p className="muted absence-drag-hint">{canManage ? t('Tipp: im Kalender über Tage ziehen, um eine Abwesenheit einzutragen.') : t('Tipp: in deiner Zeile über Tage ziehen, um Urlaub zu beantragen.')}</p>
      {provisional.length > 0 && <p className="muted absence-note">{t('{places} {year}: vorläufig. Der amtliche Feiertagsplan liegt noch nicht vor oder ist noch nicht bestätigt; einzelne Tage können fehlen oder sich um einen Tag verschieben.', { places: provisional.join(', '), year: String(year) })}</p>}
    </section>

    {(canManage || canView) && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('URLAUBSKONTO {year}', { year: String(year) })}</p><h2>{t('Anspruch, genommen, Rest.')}</h2><p>{t('Urlaubstage = Arbeitstage laut Arbeitszeitmodell (ohne Modell Mo–Fr) ohne Feiertage des Standorts; halbe Tage zählen 0,5. Übertrag und Korrektur pflegt die Leitung.')}</p></div></div>
      <ul className="account-list" aria-label={t('Urlaubskonto {year}', { year: String(year) })}>{team.map((m) => { const s = summary(m); const b = balance(m.user_id); const total = (s.entitlement ?? 0) + s.carriedOver + s.adjustment; const who = m.display_name || m.email;
        return <li key={m.user_id} className="account-row">
          <div className="person-cell">{avatar(m, m.user_id)}<strong>{who}</strong></div>
          {s.entitlement == null ? <span className="muted account-missing">{t('Nicht gepflegt')}</span> : <VacationBar summary={s} label={barLabel(s)}/>}
          <dl className="account-facts"><div><dt>{t('Anspruch')}</dt><dd>{s.entitlement == null ? '–' : fmtDays(total, locale)}</dd></div><div><dt>{t('Genommen')}</dt><dd>{fmtDays(s.taken, locale)}</dd></div><div><dt>{t('Beantragt')}</dt><dd>{fmtDays(s.requested, locale)}</dd></div><div className="account-rest"><dt>{t('Rest')}</dt><dd className={s.remaining != null && s.remaining < 0 ? 'overdue' : ''}>{s.remaining == null ? '–' : fmtDays(s.remaining, locale)}</dd></div></dl>
          {canManage && <button className="icon-button" aria-label={t('Urlaubskonto von {name} bearbeiten', { name: who })} aria-expanded={editing === m.user_id} onClick={() => setEditing((e) => e === m.user_id ? '' : m.user_id)}><Pencil size={15}/></button>}
          {canManage && editing === m.user_id && <AccountEditor key={`${m.user_id}:${year}:${b?.carried_over ?? ''}:${b?.adjustment ?? ''}:${m.vacation_days_per_year ?? ''}`} member={m} balance={b} year={year} workspace={workspace} service={service} run={run} busy={busy} onDone={() => setEditing('')}/>}
        </li>; })}</ul>
    </section>}

    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('DEINE ABWESENHEITEN')}</p><h2>{t('Deine Einträge {year}.', { year: String(year) })}</h2></div></div>
      {mine.length === 0 ? <p className="muted">{t('Keine Abwesenheiten eingetragen.')}</p> : <ul className="mine-list">{mine.map((a) => { const Icon = KIND_ICONS[a.kind]; return <li key={a.id}><span className={`kind-icon kind-${a.kind}`} aria-hidden="true"><Icon size={16}/></span><div><strong>{t(ABSENCE_KINDS[a.kind])} <span className={`badge badge-${absenceStatus(a) === 'approved' ? 'approved' : absenceStatus(a) === 'requested' ? 'submitted' : 'archived'}`}>{t(ABSENCE_STATUS[absenceStatus(a)])}</span></strong><small>{period(a)}{a.half_day && <> · {t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}</>} · {t('{days} Arbeitstage', { days: fmtDays(workdays(a, self), locale) })}{a.note && <> · {a.note}</>}</small></div>{canDelete(a) && <button className="icon-button delete-button" aria-label={t('Abwesenheit vom {date} löschen', { date: longDate(a.starts_on) })} title={t('Abwesenheit löschen')} disabled={busy} onClick={() => remove(a)}><Trash2 size={15}/></button>}</li>; })}</ul>}
    </section>
  </div>;
}

/** Anspruch, Übertrag und Korrektur einer Person bearbeiten – ein Speichern für alle drei. */
function AccountEditor({ member, balance, year, workspace, service, run, busy, onDone }: { member: Membership; balance: VacationBalance | undefined; year: number; workspace: Workspace; service: Service; run: Run; busy: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const stored = { days: member.vacation_days_per_year == null ? '' : String(member.vacation_days_per_year), carried: String(Number(balance?.carried_over ?? 0)), adjustment: String(Number(balance?.adjustment ?? 0)) };
  const [days, setDays] = useState(stored.days); const [carried, setCarried] = useState(stored.carried); const [adjustment, setAdjustment] = useState(stored.adjustment);
  const who = member.display_name || member.email;
  const changed = days !== stored.days || carried !== stored.carried || adjustment !== stored.adjustment;
  const save = () => {
    const entitlement = days.trim() === '' ? null : num(days);
    if (entitlement !== null && (entitlement < 0 || entitlement > 100)) return;
    void run(async () => {
      if (days !== stored.days) await service.setVacationEntitlement({ workspace_id: member.workspace_id, user_id: member.user_id, days: entitlement });
      if (carried !== stored.carried || adjustment !== stored.adjustment) await service.saveVacationBalance({ workspace_id: workspace.id, user_id: member.user_id, year, carried_over: num(carried), adjustment: num(adjustment), note: balance?.note ?? '' });
    }, t('Gespeichert.')).then((ok) => { if (ok) onDone(); });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); if (changed) save(); } };
  return <div className="account-editor">
    <label className="field"><span>{t('Anspruch')}</span><input aria-label={t('Urlaubsanspruch von {name} in Tagen pro Jahr', { name: who })} type="number" min="0" max="100" step="0.5" value={days} placeholder="–" onChange={(e) => setDays(e.target.value)} onKeyDown={onKey}/></label>
    <label className="field"><span>{t('Übertrag')}</span><input aria-label={t('Übertrag von {name}', { name: who })} type="number" min="-100" max="100" step="0.5" value={carried} onChange={(e) => setCarried(e.target.value)} onKeyDown={onKey}/></label>
    <label className="field"><span>{t('Korrektur')}</span><input aria-label={t('Korrektur von {name}', { name: who })} type="number" min="-100" max="100" step="0.5" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} onKeyDown={onKey}/></label>
    <div className="button-row"><button type="button" className="button primary small" disabled={busy || !changed} onClick={save}><Check size={14}/> {t('Speichern')}</button><button type="button" className="text-button" onClick={onDone}>{t('Abbrechen')}</button></div>
  </div>;
}
