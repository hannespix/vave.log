import { useEffect, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import type { Absence, Membership, Project, Task, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { capacityPlan, loadPercent, type CapacityCell, type CapacityPlan } from '../shared/capacity';
import { Empty, Notice } from './components';
import { useI18n } from './i18n';
import { initials, minutesLabel, shortDate } from './helpers';
import { SelectMenu } from './select-menu';
import './planning.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
interface Props { members: Membership[]; projects: Project[]; tasks: Task[]; workspace: Workspace; service: Service; run: Run; busy: boolean; today: string; reloadKey: unknown; onEdit: (task: Task) => void; onOpenProject: (id: string) => void }
const WEEK_OPTIONS = [4, 6, 8, 12];
const UNASSIGNED = '__unassigned__';

/** Kapazitäts-Cockpit: Heatmap Personen × Wochen, Nachsteuerung direkt in der Zelle. */
export function PlanningArea({ members, projects, tasks, workspace, service, run, busy, today, reloadKey, onEdit, onOpenProject }: Props) {
  const { t, locale } = useI18n();
  const [weeks, setWeeks] = useState(6);
  const [effort, setEffort] = useState<Map<string, number> | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selected, setSelected] = useState<{ user: string; week: number } | null>(null);
  const horizonTo = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => Promise.all([service.listTaskEffort(workspace.id), service.listAbsences(workspace.id, today, horizonTo < `${today.slice(0, 4)}-12-31` ? horizonTo : horizonTo)]))
      .then(([rows, list]) => { if (alive) { setEffort(new Map(rows.map((r) => [r.task_id, r.minutes]))); setAbsences(list); } })
      .catch(() => { if (alive) { setEffort(new Map()); setAbsences([]); } });
    return () => { alive = false; };
  }, [service, workspace.id, today, horizonTo, reloadKey]);
  const team = members.filter((m) => m.role !== 'disabled' && !m.is_demo);
  const plan: CapacityPlan = capacityPlan({ members: team, tasks, effort: effort ?? new Map(), absences, today, weeks, defaultLocation: workspace.default_location ?? null });
  const name = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.display_name || m?.email || t('Teammitglied'); };
  const weekLabel = (w: { from: string; to: string }) => `${shortDate(w.from)} – ${shortDate(w.to)}`;
  const cellClass = (cell: CapacityCell) => { const p = loadPercent(cell); return p == null ? 'load-unknown' : cell.available === 0 ? (cell.planned > 0 ? 'load-over load-off' : 'load-off') : p > 100 ? 'load-over' : p >= 80 ? 'load-full' : 'load-free'; };
  const cellText = (cell: CapacityCell) => { const p = loadPercent(cell); return p == null ? t('{planned} geplant', { planned: minutesLabel(cell.planned) }) : p === Infinity ? t('{planned} geplant, keine Kapazität', { planned: minutesLabel(cell.planned) }) : t('{planned} von {available} ({percent} %)', { planned: minutesLabel(cell.planned), available: minutesLabel(cell.available ?? 0), percent: p }); };
  const current = selected ? (selected.user === UNASSIGNED ? plan.unassigned[selected.week] : plan.rows.find((r) => r.user_id === selected.user)?.cells[selected.week]) : null;
  const totals = plan.weeks.map((_, i) => plan.rows.reduce((acc, r) => ({ available: acc.available + (r.cells[i].available ?? 0), planned: acc.planned + r.cells[i].planned }), { available: 0, planned: 0 }));
  if (!team.length) return <section className="panel"><Empty title={t('Niemand gefunden.')} text={t('Lade zuerst Personen in den Workspace ein und pflege ihre Kapazität.')}/></section>;
  return <>
    <div className="list-toolbar planning-toolbar"><div className="segmented" aria-label={t('Zeithorizont')}>{WEEK_OPTIONS.map((n) => <button key={n} className={weeks === n ? 'selected' : ''} aria-pressed={weeks === n} onClick={() => { setWeeks(n); setSelected((s) => s && s.week < n ? s : null); }}>{t('{count} Wochen', { count: n })}</button>)}</div><span className="planning-legend" aria-hidden="true"><span className="load-swatch load-free"/>{t('unter 80 %')}<span className="load-swatch load-full"/>{t('80–100 %')}<span className="load-swatch load-over"/>{t('über 100 %')}<span className="load-swatch load-off"/>{t('abwesend')}</span></div>
    <Notice kind="info">{t('Geplant = Restaufwand der zugewiesenen offenen Aufgaben (Schätzung minus gebuchte Zeit), gleichmäßig über die Werktage bis zum Termin verteilt. Ohne Termin zählt alles in die laufende Woche. Verfügbar = Arbeitszeitmodell minus Feiertage und genehmigte Abwesenheiten.')}</Notice>
    <section className="panel table-panel"><div className="table-scroll" tabIndex={0} role="region" aria-label={t('Kapazität je Person und Woche')}><table className="planning-grid"><thead><tr><th scope="col">{t('Person')}</th>{plan.weeks.map((w, i) => <th scope="col" key={w.from} className={today >= w.from && today <= w.to ? 'week-current' : ''}><span>{t('KW {week}', { week: isoWeek(w.from) })}</span><strong>{weekLabel(w)}</strong>{totals[i].available > 0 && <small>{Math.round(totals[i].planned / totals[i].available * 100)} %</small>}</th>)}</tr></thead><tbody>
      {plan.rows.map((row) => { const m = members.find((x) => x.user_id === row.user_id); return <tr key={row.user_id}><th scope="row"><div className="person-cell"><span className="avatar tiny-avatar">{initials(name(row.user_id))}</span><div><strong>{name(row.user_id)}</strong><small className="muted">{m?.weekly_capacity_minutes == null ? t('Kapazität nicht gepflegt') : t('{time}/Woche', { time: minutesLabel(m.weekly_capacity_minutes) })}</small></div></div></th>{row.cells.map((cell, i) => <td key={i}><button type="button" className={`load-cell ${cellClass(cell)}${selected?.user === row.user_id && selected.week === i ? ' selected' : ''}`} aria-pressed={selected?.user === row.user_id && selected.week === i} aria-label={`${name(row.user_id)}, ${weekLabel(plan.weeks[i])}: ${cellText(cell)}${cell.unestimated ? `, ${t('{count} ungeschätzt', { count: cell.unestimated })}` : ''}`} onClick={() => setSelected((s) => s && s.user === row.user_id && s.week === i ? null : { user: row.user_id, week: i })}><strong>{cell.available == null ? minutesLabel(cell.planned) : `${Math.round(cell.planned / 60)} / ${Math.round(cell.available / 60)} h`}</strong><small>{loadPercent(cell) == null ? t('ohne Soll') : loadPercent(cell) === Infinity ? t('abwesend') : `${loadPercent(cell)} %`}{cell.unestimated > 0 && <span className="load-unestimated" title={t('{count} ungeschätzt', { count: cell.unestimated })}>+{cell.unestimated}?</span>}</small></button></td>)}</tr>; })}
      <tr className="planning-unassigned"><th scope="row"><div className="person-cell"><span className="avatar tiny-avatar">?</span><div><strong>{t('Nicht zugewiesen')}</strong><small className="muted">{t('Freie Arbeit, die noch niemand hat')}</small></div></div></th>{plan.unassigned.map((cell, i) => <td key={i}><button type="button" className={`load-cell load-unknown${cell.planned || cell.unestimated ? ' load-open' : ''}${selected?.user === UNASSIGNED && selected.week === i ? ' selected' : ''}`} aria-pressed={selected?.user === UNASSIGNED && selected.week === i} aria-label={`${t('Nicht zugewiesen')}, ${weekLabel(plan.weeks[i])}: ${cellText(cell)}${cell.unestimated ? `, ${t('{count} ungeschätzt', { count: cell.unestimated })}` : ''}`} onClick={() => setSelected((s) => s && s.user === UNASSIGNED && s.week === i ? null : { user: UNASSIGNED, week: i })}><strong>{cell.planned ? minutesLabel(cell.planned) : '–'}</strong><small>{cell.unestimated > 0 && <span className="load-unestimated">+{cell.unestimated}?</span>}</small></button></td>)}</tr>
    </tbody></table></div></section>
    {selected && current && <section className="panel planning-detail" aria-live="polite"><div className="panel-heading"><div><p className="eyebrow">{selected.user === UNASSIGNED ? t('NICHT ZUGEWIESEN') : name(selected.user).toUpperCase()}</p><h2>{weekLabel(plan.weeks[selected.week])}</h2><p>{cellText(current)}{current.unestimated > 0 && <> · {t('{count} ungeschätzt', { count: current.unestimated })}</>}</p></div></div>
      {current.tasks.length === 0 ? <p className="muted">{t('Keine Aufgaben in dieser Woche.')}</p> : <div className="planning-tasks">{current.tasks.map((share) => { const task = tasks.find((x) => x.id === share.task_id); if (!task) return null; const project = projects.find((p) => p.id === task.project_id); return <TaskRow key={task.id} task={task} project={project} share={share.minutes} booked={effort?.get(task.id) ?? 0} members={team} service={service} run={run} busy={busy} locale={locale} onEdit={onEdit} onOpenProject={onOpenProject}/>; })}</div>}
    </section>}
  </>;
}

/** Eine Aufgabe in der Zellenliste: Person, Termin und Schätzung lassen sich direkt ändern. */
function TaskRow({ task, project, share, booked, members, service, run, busy, locale, onEdit, onOpenProject }: { task: Task; project: Project | undefined; share: number; booked: number; members: Membership[]; service: Service; run: Run; busy: boolean; locale: string; onEdit: (task: Task) => void; onOpenProject: (id: string) => void }) {
  const { t } = useI18n();
  const [assignee, setAssignee] = useState(task.assignee_id ?? '');
  const [due, setDue] = useState(task.due_date ?? '');
  const [hours, setHours] = useState(task.estimated_minutes ? String(Math.round(task.estimated_minutes / 6) / 10) : '');
  const changed = assignee !== (task.assignee_id ?? '') || due !== (task.due_date ?? '') || hours !== (task.estimated_minutes ? String(Math.round(task.estimated_minutes / 6) / 10) : '');
  const save = () => { const minutes = hours.trim() === '' ? null : Math.round(Number(hours.replace(',', '.')) * 60); if (minutes !== null && (!Number.isFinite(minutes) || minutes < 1)) return; void run(() => service.saveTask({ id: task.id, workspace_id: task.workspace_id, project_id: task.project_id, title: task.title, status: task.status, assignee_id: assignee || null, due_date: due || null, estimated_minutes: minutes, is_milestone: task.is_milestone ?? false, repeat: task.repeat }), t('Aufgabe umgeplant.')); };
  return <div className="planning-task"><div className="planning-task-main"><button className="project-text-link" onClick={() => onOpenProject(task.project_id)} aria-label={t('Projekt {name} öffnen', { name: project?.name ?? '' })}><span className="color-dot" style={{ backgroundColor: project?.color }}/>{project?.code ?? ''}<ArrowUpRight size={11}/></button><button className="task-title planning-task-title" onClick={() => onEdit(task)}>{task.title}</button><small className="muted">{t('{share} in dieser Woche', { share: minutesLabel(share) })}{task.estimated_minutes ? ` · ${t('{booked} von {estimate} gebucht', { booked: minutesLabel(booked), estimate: minutesLabel(task.estimated_minutes) })}` : ` · ${t('ohne Schätzung')}`}{task.status === 'doing' && ` · ${t('In Arbeit')}`}</small></div>
    <div className="planning-task-controls"><SelectMenu compact label={t('Zuständig für {name}', { name: task.title })} value={assignee} onChange={setAssignee} options={[{ value: '', label: t('Nicht zugewiesen') }, ...members.map((m) => ({ value: m.user_id, label: m.display_name || m.email }))]}/><label className="planning-inline"><span className="sr-only">{t('Termin für {name}', { name: task.title })}</span><input type="date" min="2000-01-01" max="2100-12-31" value={due} onChange={(e) => setDue(e.target.value)} lang={locale}/></label><label className="planning-inline planning-hours"><span className="sr-only">{t('Schätzung für {name} in Stunden', { name: task.title })}</span><input type="number" min="0.25" step="0.25" inputMode="decimal" placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)}/></label>{changed && <button type="button" className="icon-button" aria-label={t('Umplanung speichern')} title={t('Umplanung speichern')} disabled={busy} onClick={save}><Check size={15}/></button>}</div></div>;
}
/** ISO-Kalenderwoche eines Datums. */
export function isoWeek(day: string): number {
  const d = new Date(`${day}T12:00:00Z`); const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}
