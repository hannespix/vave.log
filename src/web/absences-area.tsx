import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import type { Absence, Membership, VacationBalance, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { holidaysBetween } from '../shared/holidays';
import { absenceStatus, absenceWorkdays, absencesIcs, monthDays, overlapCount, vacationSummary } from '../shared/vacation';
import { Empty, Field, Notice } from './components';
import { useI18n } from './i18n';
import { downloadText, initials, longDate } from './helpers';
import { SelectMenu } from './select-menu';
import './absences.css';

export const ABSENCE_KINDS = { vacation: 'Urlaub', sick: 'Krank', holiday: 'Feiertag', other: 'Sonstiges' } as const;
export const ABSENCE_STATUS = { requested: 'Beantragt', approved: 'Genehmigt', declined: 'Abgelehnt' } as const;
type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Confirm = (options: { title: string; text: string; label: string; action: () => Promise<unknown>; success?: string }) => void;
interface Props { members: Membership[]; workspace: Workspace; userId: string; manager: boolean; service: Service; run: Run; busy: boolean; confirm: Confirm; today: string; reloadKey: unknown }

const monthOf = (day: string) => day.slice(0, 7);
const shiftMonth = (month: string, by: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const num = (value: string) => { const n = Number(value.replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 2) / 2 : 0; };
const fmtDays = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);

/** Bereich „Abwesenheiten“: Monatskalender Personen × Tage, Antrag mit Vorschau, Freigaben der Leitung, Urlaubskonto je Jahr. */
export function AbsencesArea({ members, workspace, userId, manager, service, run, busy, confirm, today, reloadKey }: Props) {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(monthOf(today));
  const year = Number(month.slice(0, 4));
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [balances, setBalances] = useState<VacationBalance[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ person: userId, kind: 'vacation' as Absence['kind'], from: today, to: today, half: '' as '' | 'am' | 'pm', note: '' });
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => Promise.all([service.listAbsences(workspace.id, `${year}-01-01`, `${year}-12-31`), service.listVacationBalances(workspace.id, year)]))
      .then(([list, bal]) => { if (alive) { setAbsences(list); setBalances(bal); } })
      .catch(() => { if (alive) { setAbsences([]); setBalances([]); } });
    return () => { alive = false; };
  }, [service, workspace.id, year, reloadKey]);

  const team = members.filter((m) => m.role !== 'disabled' && !m.is_demo);
  const self = members.find((m) => m.user_id === userId);
  const name = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.display_name || m?.email || t('Teammitglied'); };
  const location = (m: Membership | undefined) => m?.location ?? workspace.default_location ?? null;
  const list = absences ?? [];
  const days = monthDays(year, Number(month.slice(5, 7)));
  const holidayCache = new Map<string, Map<string, string>>();
  const holidays = (loc: string | null) => { const key = loc ?? ''; let map = holidayCache.get(key); if (!map) { map = holidaysBetween(loc, days[0], days[days.length - 1]); holidayCache.set(key, map); } return map; };
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`));
  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const requests = list.filter((a) => absenceStatus(a) === 'requested').sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const balance = (id: string) => balances.find((b) => b.user_id === id);
  const summary = (m: Membership) => { const b = balance(m.user_id); return vacationSummary({ entitlement: m.vacation_days_per_year == null ? null : Number(m.vacation_days_per_year), carriedOver: Number(b?.carried_over ?? 0), adjustment: Number(b?.adjustment ?? 0), absences: list, userId: m.user_id, year, location: location(m), schedule: m.work_schedule ?? null }); };

  const formMember = members.find((m) => m.user_id === form.person);
  const formDays = form.from <= form.to ? absenceWorkdays({ user_id: form.person, starts_on: form.from, ends_on: form.to, kind: form.kind, half_day: form.from === form.to ? form.half : '' }, location(formMember), undefined, undefined, formMember?.work_schedule ?? null) : 0;
  const formSummary = formMember ? summary(formMember) : null;
  const formOverlap = overlapCount({ user_id: form.person, starts_on: form.from, ends_on: form.to, kind: form.kind }, list);
  const needsApproval = workspace.absence_approval !== false && form.kind !== 'sick' && !manager;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.from > form.to) return;
    void run(() => service.saveAbsence({ workspace_id: workspace.id, user_id: form.person, starts_on: form.from, ends_on: form.to, kind: form.kind, note: form.note.trim(), half_day: form.from === form.to ? form.half : '' }), needsApproval ? t('Antrag gestellt. Die Leitung entscheidet.') : t('Abwesenheit eingetragen.')).then((ok) => { if (ok) { setAdding(false); setForm((f) => ({ ...f, note: '', half: '' })); } });
  }
  const exportIcs = () => downloadText(`vave-log-abwesenheiten-${year}.ics`, absencesIcs(list, name, { vacation: t(ABSENCE_KINDS.vacation), sick: t(ABSENCE_KINDS.sick), holiday: t(ABSENCE_KINDS.holiday), other: t(ABSENCE_KINDS.other) }), 'text/calendar;charset=utf-8');
  const canDelete = (a: Absence) => manager || (a.user_id === userId && (absenceStatus(a) === 'requested' || a.kind === 'sick'));
  const remove = (a: Absence) => confirm({ title: t('Abwesenheit löschen?'), text: t('Der Eintrag wird dauerhaft entfernt.'), label: t('Abwesenheit löschen'), action: () => service.deleteAbsence(a.id), success: t('Abwesenheit gelöscht.') });
  const mine = list.filter((a) => a.user_id === userId).sort((a, b) => b.starts_on.localeCompare(a.starts_on));

  return <>
    <div className="list-toolbar absence-toolbar">
      <div className="range-controls"><button className="icon-button" aria-label={t('Vorheriger Monat')} disabled={busy} onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={17}/></button><strong className="absence-month" aria-live="polite">{monthLabel}</strong><button className="icon-button" aria-label={t('Nächster Monat')} disabled={busy} onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight size={17}/></button><button className="text-button tiny" onClick={() => setMonth(monthOf(today))}>{t('Heute')}</button></div>
      <div className="button-row"><button className="button secondary small" disabled={!list.some((a) => absenceStatus(a) === 'approved')} onClick={exportIcs}><ArrowDownToLine size={15}/> {t('Kalender (ICS)')}</button><button className="button primary small" onClick={() => setAdding((a) => !a)} aria-expanded={adding}><Plus size={15}/> {manager ? t('Abwesenheit eintragen') : t('Urlaub beantragen')}</button></div>
    </div>
    {adding && <section className="panel"><form className="form-stack absence-form" onSubmit={submit}>
      <div className="form-grid">
        {manager ? <Field label={t('Person')}><SelectMenu label={t('Person')} value={form.person} onChange={(person) => setForm((f) => ({ ...f, person }))} options={team.map((m) => ({ value: m.user_id, label: m.display_name || m.email }))}/></Field> : <Field label={t('Person')}><input value={self?.display_name || self?.email || ''} readOnly/></Field>}
        <Field label={t('Art')}><SelectMenu label={t('Art')} searchable={false} value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind: kind as Absence['kind'] }))} options={Object.entries(ABSENCE_KINDS).map(([value, label]) => ({ value, label: t(label) }))}/></Field>
        <Field label={t('Von')}><input type="date" required value={form.from} min="2000-01-01" max="2100-12-31" onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))}/></Field>
        <Field label={t('Bis')}><input type="date" required value={form.to} min={form.from} max="2100-12-31" onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}/></Field>
      </div>
      {form.from === form.to && <Field label={t('Halber Tag')}><SelectMenu label={t('Halber Tag')} searchable={false} value={form.half} onChange={(half) => setForm((f) => ({ ...f, half: half as '' | 'am' | 'pm' }))} options={[{ value: '', label: t('Ganzer Tag') }, { value: 'am', label: t('Vormittag') }, { value: 'pm', label: t('Nachmittag') }]}/></Field>}
      <Field label={t('Notiz')}><input value={form.note} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={t('Optional, zum Beispiel: Vertretung ist Mara')}/></Field>
      <p className="absence-preview" aria-live="polite">{form.from > form.to ? t('Das Ende liegt vor dem Beginn.') : t('Zählt {days} Arbeitstage', { days: fmtDays(formDays, locale) })}{form.kind === 'vacation' && formSummary?.remaining != null && form.from <= form.to && <> · {t('Rest danach: {days} Tage', { days: fmtDays(formSummary.remaining - formDays, locale) })}</>}{formOverlap > 0 && <> · <span className="absence-overlap">{t('{count} weitere Personen sind in dieser Zeit weg', { count: formOverlap })}</span></>}</p>
      {needsApproval && <Notice kind="info">{t('Urlaub und sonstige Abwesenheiten gehen als Antrag an die Leitung. Krankmeldungen gelten sofort.')}</Notice>}
      <div className="button-row"><button className="button primary small" disabled={busy || form.from > form.to}>{needsApproval ? t('Antrag senden') : t('Speichern')}</button><button type="button" className="text-button" onClick={() => setAdding(false)}>{t('Abbrechen')}</button></div>
    </form></section>}
    {manager && requests.length > 0 && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('OFFENE ANTRÄGE')}</p><h2>{t('Das wartet auf deine Entscheidung.')}</h2></div><span className="count-circle">{requests.length}</span></div><div className="invite-list">{requests.map((a) => { const overlap = overlapCount(a, list); const m = members.find((x) => x.user_id === a.user_id); const s = m ? summary(m) : null; return <div className="invite-row absence-request" key={a.id}><div><strong>{name(a.user_id)}</strong><small>{t(ABSENCE_KINDS[a.kind])} · {longDate(a.starts_on)}{a.ends_on !== a.starts_on && <> – {longDate(a.ends_on)}</>}{a.half_day && <> · {t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}</>} · {t('{days} Arbeitstage', { days: fmtDays(absenceWorkdays(a, location(m), undefined, undefined, m?.work_schedule ?? null), locale) })}{a.kind === 'vacation' && s?.remaining != null && <> · {t('Rest danach: {days} Tage', { days: fmtDays(s.remaining, locale) })}</>}{a.note && <> · {a.note}</>}</small>{overlap > 0 && <small className="absence-overlap">{t('{count} weitere Personen sind in dieser Zeit weg', { count: overlap })}</small>}</div><div className="button-row"><button className="button primary small" disabled={busy} onClick={() => void run(() => service.decideAbsence({ id: a.id, approve: true }), t('Antrag genehmigt.'))}><Check size={14}/> {t('Genehmigen')}</button><button className="button secondary small" disabled={busy} onClick={() => confirm({ title: t('Antrag ablehnen?'), text: t('{name} wird benachrichtigt. Der Antrag bleibt als abgelehnt sichtbar.', { name: name(a.user_id) }), label: t('Ablehnen'), action: () => service.decideAbsence({ id: a.id, approve: false }), success: t('Antrag abgelehnt.') })}><X size={14}/> {t('Ablehnen')}</button></div></div>; })}</div></section>}
    <section className="panel table-panel"><div className="table-summary"><span><strong>{team.length}</strong> {t('Personen')}</span><span className="absence-legend" aria-hidden="true"><span className="cal-swatch cal-vacation"/>{t('Urlaub')}<span className="cal-swatch cal-vacation cal-requested"/>{t('Beantragt')}<span className="cal-swatch cal-sick"/>{t('Krank')}<span className="cal-swatch cal-other"/>{t('Sonstiges')}<span className="cal-swatch cal-holiday"/>{t('Feiertag')}</span></div>
      {absences === null ? <p className="muted absence-loading">{t('Workspace wird aktualisiert …')}</p> : team.length === 0 ? <Empty title={t('Niemand gefunden.')} text={t('Keine Person passt zu Suche und Filter.')}/> : <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Abwesenheitskalender {month}', { month: monthLabel })}><table className="absence-grid"><thead><tr><th scope="col">{t('Person')}</th>{days.map((day) => { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); return <th scope="col" key={day} className={`cal-day${dow === 0 || dow === 6 ? ' cal-weekend' : ''}${day === today ? ' cal-today' : ''}`} aria-label={longDate(day)}><span>{weekdayLabel.format(new Date(`${day}T12:00:00Z`)).slice(0, 2)}</span><strong>{Number(day.slice(8))}</strong></th>; })}</tr></thead><tbody>{team.map((m) => { const hol = holidays(location(m)); return <tr key={m.user_id}><th scope="row"><div className="person-cell"><span className="avatar tiny-avatar">{initials(m.display_name || m.email)}</span><span>{m.display_name || m.email}{m.user_id === userId && <span className="you-label">{t('Du')}</span>}</span></div></th>{days.map((day) => { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); const weekend = dow === 0 || dow === 6; const holiday = hol.get(day); const a = list.find((x) => x.user_id === m.user_id && x.starts_on <= day && x.ends_on >= day && absenceStatus(x) !== 'declined'); const label = a ? `${t(ABSENCE_KINDS[a.kind])}${absenceStatus(a) === 'requested' ? ` (${t('Beantragt')})` : ''}${a.half_day ? ` · ${t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}` : ''}` : holiday ?? ''; return <td key={day} className={`cal-cell${weekend ? ' cal-weekend' : ''}${holiday ? ' cal-holiday' : ''}${a ? ` cal-${a.kind} cal-${absenceStatus(a)}${a.half_day ? ` cal-half cal-${a.half_day}` : ''}` : ''}${day === today ? ' cal-today' : ''}`} title={label ? `${longDate(day)}: ${label}` : undefined}>{label && <span className="sr-only">{longDate(day)}: {label}</span>}</td>; })}</tr>; })}</tbody></table></div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('URLAUBSKONTO {year}', { year })}</p><h2>{t('Anspruch, genommen, Rest.')}</h2><p>{t('Urlaubstage = Arbeitstage laut Arbeitszeitmodell (ohne Modell Mo–Fr) ohne Feiertage des Standorts; halbe Tage zählen 0,5. Übertrag und Korrektur pflegt die Leitung.')}</p></div></div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('Urlaubskonto {year}', { year })}><table><thead><tr><th>{t('Person')}</th><th>{t('Anspruch')}</th><th>{t('Übertrag')}</th><th>{t('Korrektur')}</th><th>{t('Genommen')}</th><th>{t('Beantragt')}</th><th>{t('Rest')}</th></tr></thead><tbody>{(manager ? team : team.filter((m) => m.user_id === userId)).map((m) => { const s = summary(m); const b = balance(m.user_id); return <tr key={m.user_id}><td><div className="person-cell"><span className="avatar tiny-avatar">{initials(m.display_name || m.email)}</span><strong>{m.display_name || m.email}</strong></div></td><td>{manager ? <EntitlementCell member={m} service={service} run={run} busy={busy}/> : s.entitlement == null ? <span className="muted">{t('Nicht gepflegt')}</span> : fmtDays(s.entitlement, locale)}</td>{manager ? <BalanceCells member={m} balance={b} year={year} workspace={workspace} service={service} run={run} busy={busy}/> : <><td>{fmtDays(s.carriedOver, locale)}</td><td>{fmtDays(s.adjustment, locale)}</td></>}<td>{fmtDays(s.taken, locale)}</td><td>{fmtDays(s.requested, locale)}</td><td>{s.remaining == null ? <span className="muted">–</span> : <strong className={s.remaining < 0 ? 'overdue' : ''}>{fmtDays(s.remaining, locale)}</strong>}</td></tr>; })}</tbody></table></div>
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t('DEINE ABWESENHEITEN')}</p><h2>{t('Deine Einträge {year}.', { year })}</h2></div></div>
      {mine.length === 0 ? <p className="muted">{t('Keine Abwesenheiten eingetragen.')}</p> : <div className="invite-list">{mine.map((a) => <div className="invite-row" key={a.id}><div><strong>{t(ABSENCE_KINDS[a.kind])} <span className={`badge badge-${absenceStatus(a) === 'approved' ? 'approved' : absenceStatus(a) === 'requested' ? 'submitted' : 'archived'}`}>{t(ABSENCE_STATUS[absenceStatus(a)])}</span></strong><small>{longDate(a.starts_on)}{a.ends_on !== a.starts_on && <> – {longDate(a.ends_on)}</>}{a.half_day && <> · {t(a.half_day === 'am' ? 'Vormittag' : 'Nachmittag')}</>} · {t('{days} Arbeitstage', { days: fmtDays(absenceWorkdays(a, location(self), undefined, undefined, self?.work_schedule ?? null), locale) })}{a.note && <> · {a.note}</>}</small></div>{canDelete(a) && <button className="icon-button delete-button" aria-label={t('Abwesenheit vom {date} löschen', { date: longDate(a.starts_on) })} title={t('Abwesenheit löschen')} disabled={busy} onClick={() => remove(a)}><Trash2 size={15}/></button>}</div>)}</div>}
    </section>
  </>;
}

function EntitlementCell({ member, service, run, busy }: { member: Membership; service: Service; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const stored = member.vacation_days_per_year == null ? '' : String(member.vacation_days_per_year);
  const [value, setValue] = useState(stored);
  const save = () => { const days = value.trim() === '' ? null : num(value); if (days !== null && (days < 0 || days > 100)) return; void run(() => service.setVacationEntitlement({ workspace_id: member.workspace_id, user_id: member.user_id, days }), t('Gespeichert.')); };
  return <span className="capacity-cell"><input aria-label={t('Urlaubsanspruch von {name} in Tagen pro Jahr', { name: member.display_name || member.email })} type="number" min="0" max="100" step="0.5" value={value} placeholder="–" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}/>{value !== stored && <button type="button" className="icon-button" aria-label={t('Urlaubsanspruch speichern')} title={t('Urlaubsanspruch speichern')} disabled={busy} onClick={save}><Check size={15}/></button>}</span>;
}
function BalanceCells({ member, balance, year, workspace, service, run, busy }: { member: Membership; balance: VacationBalance | undefined; year: number; workspace: Workspace; service: Service; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const stored = { carried: String(Number(balance?.carried_over ?? 0)), adjustment: String(Number(balance?.adjustment ?? 0)) };
  const [carried, setCarried] = useState(stored.carried); const [adjustment, setAdjustment] = useState(stored.adjustment);
  const changed = carried !== stored.carried || adjustment !== stored.adjustment;
  const save = () => void run(() => service.saveVacationBalance({ workspace_id: workspace.id, user_id: member.user_id, year, carried_over: num(carried), adjustment: num(adjustment), note: balance?.note ?? '' }), t('Gespeichert.'));
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  return <><td><span className="capacity-cell"><input aria-label={t('Übertrag von {name}', { name: member.display_name || member.email })} type="number" min="-100" max="100" step="0.5" value={carried} onChange={(e) => setCarried(e.target.value)} onKeyDown={onKey}/></span></td><td><span className="capacity-cell"><input aria-label={t('Korrektur von {name}', { name: member.display_name || member.email })} type="number" min="-100" max="100" step="0.5" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} onKeyDown={onKey}/>{changed && <button type="button" className="icon-button" aria-label={t('Urlaubskonto speichern')} title={t('Urlaubskonto speichern')} disabled={busy} onClick={save}><Check size={15}/></button>}</span></td></>;
}
