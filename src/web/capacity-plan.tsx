import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, FileSpreadsheet, Layers, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import type { Absence, Membership, PhaseEffort, PlanActual, PlanCell, PlanRow, Project, ProjectPhase, ServiceType, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { capacityMatrix, freeLevel, hoursText, matrixWeeks, parseHours, type MatrixPerson, type MatrixRow } from '../shared/capacity-matrix';
import { mondayOf } from '../shared/capacity';
import { shiftDate } from '../shared/holidays';
import { Dialog, Empty, Field, FormActions, Notice, Spinner } from './components';
import { useI18n } from './i18n';
import { errorMessage, initials, shortDate } from './helpers';
import { SelectMenu, memberOption, projectOption } from './select-menu';
import { PlanImportDialog } from './capacity-import-dialog';
import './capacity-plan.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
interface Props {
  members: Membership[]; projects: Project[]; phases: ProjectPhase[]; serviceTypes: ServiceType[]; planRows: PlanRow[];
  workspace: Workspace; service: Service; run: Run; busy: boolean; today: string; reloadKey: unknown;
  canEdit: boolean; canProjects: boolean; onOpenProject: (id: string) => void;
}
interface Loaded { cells: Map<string, number>; outside: Map<string, number>; actuals: PlanActual[]; absences: Absence[]; phasePlan: Map<string, number>; phaseBooked: Map<string, number>; projectBooked: Map<string, number> }
type Modal = { type: 'row'; row?: PlanRow; projectId?: string } | { type: 'phases'; projectId: string } | { type: 'types' } | { type: 'import' };
const SPANS = [8, 13, 26];
const SPAN_KEY = 'vave-log.plan-span';
const cellKey = (rowId: string, week: string) => `${rowId}|${week}`;
const readSpan = () => { try { const n = Number(localStorage.getItem(SPAN_KEY)); return SPANS.includes(n) ? n : 13; } catch { return 13; } };

/** Kapazitätsplan: Team mit freier Kapazität, darunter je Projekt Phasen und Stunden je Kalenderwoche. */
export function CapacityPlanArea({ members, projects, phases, serviceTypes, planRows, workspace, service, run, busy, today, reloadKey, canEdit, canProjects, onOpenProject }: Props) {
  const { t, locale } = useI18n();
  const [span, setSpan] = useState(readSpan);
  const [from, setFrom] = useState(() => shiftDate(mondayOf(today), -7));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<{ pending: number; error: string; saved: boolean }>({ pending: 0, error: '', saved: false });
  const [person, setPerson] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const weeks = useMemo(() => matrixWeeks(from, span, today), [from, span, today]);
  const rangeFrom = weeks[0].start, rangeTo = weeks[weeks.length - 1].start, rangeEnd = weeks[weeks.length - 1].end;

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => Promise.allSettled([service.listPlanCells(workspace.id, rangeFrom, rangeTo), service.listPlanTotals(workspace.id), service.listPlanActuals(workspace.id, rangeFrom, rangeTo),
      service.listAbsences(workspace.id, rangeFrom, rangeEnd), service.listPhasePlan(workspace.id), service.listPhaseEffort(workspace.id)]))
      .then(([cells, totals, actuals, absences, phasePlan, effort]) => {
        if (!alive) return;
        const map = new Map<string, number>(), visible = new Map<string, number>();
        for (const c of cells.status === 'fulfilled' ? cells.value : []) { map.set(cellKey(c.row_id, c.week_start), c.minutes); visible.set(c.row_id, (visible.get(c.row_id) ?? 0) + c.minutes); }
        const outside = new Map((totals.status === 'fulfilled' ? totals.value : []).map((x) => [x.row_id, Math.max(0, x.minutes - (visible.get(x.row_id) ?? 0))]));
        const phaseBooked = new Map<string, number>(), projectBooked = new Map<string, number>();
        for (const e of effort.status === 'fulfilled' ? effort.value : [] as PhaseEffort[]) { projectBooked.set(e.project_id, (projectBooked.get(e.project_id) ?? 0) + e.minutes); if (e.phase_id) phaseBooked.set(e.phase_id, (phaseBooked.get(e.phase_id) ?? 0) + e.minutes); }
        setLoaded({ cells: map, outside, actuals: actuals.status === 'fulfilled' ? actuals.value : [], absences: absences.status === 'fulfilled' ? absences.value : [],
          phasePlan: new Map((phasePlan.status === 'fulfilled' ? phasePlan.value : []).map((x) => [x.phase_id, x.minutes])), phaseBooked, projectBooked });
        // Der Plan selbst muss lesbar sein; fehlen nur gebuchte Zeiten oder Abwesenheiten, bleibt er nutzbar.
        const failed = cells.status === 'rejected' ? cells.reason : absences.status === 'rejected' ? absences.reason : null;
        setLoadError(failed ? errorMessage(failed) : '');
      });
    return () => { alive = false; };
  }, [service, workspace.id, rangeFrom, rangeTo, rangeEnd, reloadKey]);

  const team = useMemo(() => members.filter((m) => m.role !== 'disabled'), [members]);
  const rows = useMemo(() => planRows.filter((r) => (!person || r.user_id === person) && (!projectFilter || r.project_id === projectFilter)), [planRows, person, projectFilter]);
  const matrix = useMemo(() => capacityMatrix({ members: team, rows, phases, cells: [...(loaded?.cells ?? [])].map(([key, minutes]) => { const [row_id, week_start] = key.split('|'); return { row_id, week_start, minutes }; }),
    actuals: loaded?.actuals ?? [], outside: loaded?.outside, absences: loaded?.absences ?? [], from, weeks: span, today, defaultLocation: workspace.default_location ?? null }), [team, rows, phases, loaded, from, span, today, workspace.default_location]);
  const planned = new Set(planRows.map((r) => r.user_id).filter(Boolean));
  const people = matrix.people.filter((p) => person ? p.user_id === person : everyone || planned.has(p.user_id));
  const hidden = matrix.people.length - people.length;
  const projectOf = (id: string) => projects.find((p) => p.id === id);
  const blocks = [...matrix.projects].sort((a, b) => (projectOf(a.project_id)?.name ?? '').localeCompare(projectOf(b.project_id)?.name ?? '', locale));
  const typeName = (id: string | null) => serviceTypes.find((s) => s.id === id)?.name ?? '';
  const memberName = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.display_name || m?.email || t('Teammitglied'); };
  const h = (minutes: number) => hoursText(minutes, locale);
  const months = weeks.reduce<{ key: string; count: number }[]>((acc, w) => { const last = acc[acc.length - 1]; if (last && last.key === w.month) last.count++; else acc.push({ key: w.month, count: 1 }); return acc; }, []);
  const monthLabel = (key: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: '2-digit' }).format(new Date(`${key}-01T12:00:00Z`));
  const move = (n: number) => setFrom((f) => shiftDate(f, n * 7));
  const chooseSpan = (n: number) => { setSpan(n); try { localStorage.setItem(SPAN_KEY, String(n)); } catch { /* ohne Speicher gilt die Wahl bis zum Neuladen */ } };

  const saveCell = (row: MatrixRow, week: string, minutes: number) => {
    const key = cellKey(row.id, week), before = loaded?.cells.get(key) ?? 0;
    if (!loaded || before === minutes) return;
    const put = (value: number) => setLoaded((l) => { if (!l) return l; const cells = new Map(l.cells); if (value > 0) cells.set(key, value); else cells.delete(key); return { ...l, cells }; });
    put(minutes); setSaveState((s) => ({ pending: s.pending + 1, error: '', saved: false }));
    service.setPlanCells([{ workspace_id: workspace.id, row_id: row.id, week_start: week, minutes }])
      .then(() => setSaveState((s) => ({ pending: s.pending - 1, error: s.error, saved: !s.error })))
      .catch((error: unknown) => { put(before); setSaveState((s) => ({ pending: s.pending - 1, error: errorMessage(error), saved: false })); });
  };
  // Ausfüllen wie in der Tabellenkalkulation: Der Griff an einer Zelle zieht ihren Wert über weitere Wochen derselben Zeile.
  const [fill, setFill] = useState<{ r: number; from: number; to: number } | null>(null);
  const filling = useRef<{ r: number; from: number; to: number } | null>(null);
  const saveCells = (row: MatrixRow, weekStartsToSet: string[], minutes: number) => {
    if (!loaded) return;
    const changes = weekStartsToSet.map((week) => ({ week, key: cellKey(row.id, week), before: loaded.cells.get(cellKey(row.id, week)) ?? 0 })).filter((c) => c.before !== minutes);
    if (!changes.length) return;
    const put = (value: (c: typeof changes[number]) => number) => setLoaded((l) => { if (!l) return l; const cells = new Map(l.cells); for (const c of changes) { const v = value(c); if (v > 0) cells.set(c.key, v); else cells.delete(c.key); } return { ...l, cells }; });
    put(() => minutes); setSaveState((st) => ({ pending: st.pending + 1, error: '', saved: false }));
    service.setPlanCells(changes.map((c) => ({ workspace_id: workspace.id, row_id: row.id, week_start: c.week, minutes })))
      .then(() => setSaveState((st) => ({ pending: st.pending - 1, error: st.error, saved: !st.error })))
      .catch((error: unknown) => { put((c) => c.before); setSaveState((st) => ({ pending: st.pending - 1, error: errorMessage(error), saved: false })); });
  };
  const fillStart = (e: ReactPointerEvent<HTMLElement>, r: number, c: number) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    filling.current = { r, from: c, to: c }; setFill(filling.current);
  };
  const fillMove = (e: ReactPointerEvent<HTMLElement>) => {
    const f = filling.current; if (!f) return;
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('td[data-fill-row]');
    if (!cell || Number(cell.dataset.fillRow) !== f.r) return;
    const to = Number(cell.dataset.fillCol);
    if (to !== f.to) { filling.current = { ...f, to }; setFill(filling.current); }
  };
  const fillEnd = (e: ReactPointerEvent<HTMLElement>, row: MatrixRow) => {
    const f = filling.current; filling.current = null; setFill(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!f || f.to === f.from) return;
    const lo = Math.min(f.from, f.to), hi = Math.max(f.from, f.to);
    saveCells(row, weeks.slice(lo, hi + 1).filter((_, i) => lo + i !== f.from).map((w) => w.start), row.cells[f.from]);
  };
  const copyRight = (row: MatrixRow, r: number, c: number, minutes: number) => { if (c + 1 >= weeks.length) return; saveCells(row, [weeks[c + 1].start], minutes); focusCell(r, c + 1); };
  const focusCell = (r: number, c: number) => { const el = document.querySelector<HTMLInputElement>(`[data-plan-cell="${r}:${c}"]`); if (el) { el.focus(); el.select(); } };

  const freeTotal = weeks.map((_, i) => people.reduce((a, p) => a + (p.free[i] ?? 0), 0));
  const openHours = matrix.open.reduce((a, b) => a + b, 0);
  const overbooked = people.reduce((a, p) => a + weeks.filter((_, i) => p.available[i] != null && p.planned[i] > p.available[i]!).length, 0);
  const active = projects.filter((p) => p.status === 'active');
  const dialogs = <>
    {modal?.type === 'row' && <RowDialog row={modal.row} projectId={modal.projectId} projects={active} members={team} serviceTypes={serviceTypes} planRows={planRows} workspace={workspace} service={service} run={run} busy={busy} today={today} onClose={() => setModal(null)}/>}
    {modal?.type === 'phases' && <PhasesDialog project={projectOf(modal.projectId)!} phases={phases.filter((p) => p.project_id === modal.projectId)} planned={loaded?.phasePlan ?? new Map()} booked={loaded?.phaseBooked ?? new Map()} workspace={workspace} service={service} run={run} busy={busy} onClose={() => setModal(null)}/>}
    {modal?.type === 'types' && <ServiceTypesDialog serviceTypes={serviceTypes} workspace={workspace} service={service} run={run} busy={busy} onClose={() => setModal(null)}/>}
    {modal?.type === 'import' && <PlanImportDialog members={team} projects={projects} workspace={workspace} service={service} run={run} busy={busy} canProjects={canProjects} hasPlan={planRows.length > 0} today={today} onClose={() => setModal(null)}/>}
  </>;
  const actions = canEdit && <div className="plan-actions">
    <button type="button" className="button secondary small" onClick={() => setModal({ type: 'types' })}><Tags size={14}/> {t('Leistungsarten')}</button>
    <button type="button" className="button secondary small" onClick={() => setModal({ type: 'import' })}><FileSpreadsheet size={14}/> {t('Aus Excel importieren')}</button>
    <button type="button" className="button primary small" onClick={() => setModal({ type: 'row' })} disabled={!active.length}><Plus size={14}/> {t('Zeile hinzufügen')}</button>
  </div>;

  if (!loaded) return <Spinner/>;
  if (!planRows.length) return <>
    {loadError && <Notice>{t('Die Planung ist unvollständig geladen: {reason}', { reason: loadError })}</Notice>}
    <section className="panel"><Empty title={t('Noch kein Kapazitätsplan.')} text={canEdit ? t('Plane Personen je Projekt und Kalenderwoche ein – oder übernimm die bestehende Excel-Tabelle in einem Schritt.') : t('Sobald die Planung Personen auf Projekte einplant, steht hier die Auslastung je Kalenderwoche.')} action={actions || undefined}/></section>
    {dialogs}
  </>;

  let rowIndex = -1;
  return <>
    {loadError && <Notice>{t('Die Planung ist unvollständig geladen: {reason}', { reason: loadError })}</Notice>}
    {saveState.error && <Notice>{t('Der Wert wurde nicht gespeichert: {reason}', { reason: saveState.error })}</Notice>}
    <div className="list-toolbar plan-toolbar">
      <div className="plan-range"><button type="button" className="icon-button" aria-label={t('Vier Wochen zurück')} onClick={() => move(-4)}><ChevronLeft size={16}/></button><button type="button" className="button secondary small" onClick={() => setFrom(shiftDate(mondayOf(today), -7))}>{t('Heute')}</button><button type="button" className="icon-button" aria-label={t('Vier Wochen weiter')} onClick={() => move(4)}><ChevronRight size={16}/></button>
        <div className="segmented" aria-label={t('Zeithorizont')}>{SPANS.map((n) => <button key={n} className={span === n ? 'selected' : ''} aria-pressed={span === n} onClick={() => chooseSpan(n)}>{t('{count} Wochen', { count: n })}</button>)}</div></div>
      <div className="filter-group"><SelectMenu compact label={t('Person')} value={person} onChange={setPerson} options={[{ value: '', label: t('Alle Personen') }, ...team.filter((m) => planned.has(m.user_id)).map((m) => memberOption(m))]}/><SelectMenu compact label={t('Projekt')} value={projectFilter} onChange={setProjectFilter} options={[{ value: '', label: t('Alle Projekte') }, ...projects.filter((p) => planRows.some((r) => r.project_id === p.id)).map((p) => projectOption(p))]}/></div>
      {actions}
    </div>
    <div className="plan-stats" aria-live="polite">
      <span><strong>{people.length}</strong> {t('Personen im Plan')}</span>
      <span className={overbooked ? 'plan-stat-over' : ''}><strong>{overbooked}</strong> {t('überbuchte Personenwochen')}</span>
      <span><strong>{h(openHours)} h</strong> {t('noch niemandem zugewiesen')}</span>
      <span className="plan-legend" aria-hidden="true"><span className="plan-swatch plan-free"/>{t('frei')}<span className="plan-swatch plan-tight"/>{t('knapp')}<span className="plan-swatch plan-full"/>{t('voll')}<span className="plan-swatch plan-over"/>{t('überbucht')}<span className="plan-swatch plan-off"/>{t('abwesend')}</span>
      <span className="plan-save" role="status">{saveState.pending > 0 ? t('Speichert …') : saveState.saved ? t('Gespeichert.') : ''}</span>
    </div>
    <section className="panel table-panel plan-panel"><div className="table-scroll" tabIndex={0} role="region" aria-label={t('Kapazitätsplan je Projekt, Person und Kalenderwoche')}>
      <table className="plan-grid" style={{ '--weeks': weeks.length } as CSSProperties}>
        <thead>
          <tr className="plan-months"><th scope="col" className="plan-label"/><th scope="col" className="plan-sum"/>{months.map((m) => <th key={m.key} scope="colgroup" colSpan={m.count}>{monthLabel(m.key)}</th>)}</tr>
          <tr><th scope="col" className="plan-label">{t('Projekt · Leistungsart · Person')}</th><th scope="col" className="plan-sum">{t('Stunden')}</th>{weeks.map((w) => <th scope="col" key={w.start} className={w.current ? 'plan-week week-current' : 'plan-week'} title={`${shortDate(w.start)} – ${shortDate(w.end)}`}><span>{t('KW {week}', { week: w.week })}</span><small>{shortDate(w.start)}</small></th>)}</tr>
        </thead>
        <tbody className="plan-team">
          <tr className="plan-section"><th scope="row" className="plan-label">{t('TEAM · FREIE STUNDEN')}</th><td className="plan-sum"/><td colSpan={weeks.length}><span className="muted">{t('Arbeitszeitmodell minus Feiertage, genehmigte Abwesenheiten und Planstunden')}</span></td></tr>
          {people.map((p) => <PersonLine key={p.user_id} person={p} name={memberName(p.user_id)} roles={p.service_types.map(typeName).filter(Boolean).join(' · ')} weeks={weeks} h={h}/>)}
          {!person && hidden > 0 && <tr className="plan-more"><th scope="row" className="plan-label"><button type="button" className="text-button" onClick={() => setEveryone(true)}>{t('{count} weitere Personen ohne Planung anzeigen', { count: hidden })}</button></th><td className="plan-sum"/><td colSpan={weeks.length}/></tr>}
          {!person && everyone && <tr className="plan-more"><th scope="row" className="plan-label"><button type="button" className="text-button" onClick={() => setEveryone(false)}>{t('Nur verplante Personen anzeigen')}</button></th><td className="plan-sum"/><td colSpan={weeks.length}/></tr>}
          {!person && <tr className="plan-total"><th scope="row" className="plan-label">{t('Team frei')}</th><td className="plan-sum"/>{freeTotal.map((m, i) => <td key={i} className={m < 0 ? 'plan-negative' : ''}>{m < 0 ? '−' : ''}{h(Math.abs(m))}</td>)}</tr>}
          {!person && openHours > 0 && <tr className="plan-total plan-open"><th scope="row" className="plan-label">{t('Offen · noch niemandem zugewiesen')}</th><td className="plan-sum">{h(openHours)}</td>{matrix.open.map((m, i) => <td key={i}>{m ? h(m) : ''}</td>)}</tr>}
        </tbody>
        {blocks.map((block) => { const project = projectOf(block.project_id); if (!project) return null;
          const offered = project.budget_minutes || block.offered, booked = loaded.projectBooked.get(project.id) ?? 0, visiblePhases = block.phases.filter((p) => p.from >= 0);
          return <tbody key={block.project_id} className="plan-project">
            <tr className="plan-project-head"><th scope="row" className="plan-label"><div className="plan-project-name"><button type="button" className="project-text-link" onClick={() => onOpenProject(project.id)} aria-label={t('Projekt {name} öffnen', { name: project.name })}><span className="color-dot" style={{ backgroundColor: project.color }}/><strong>{project.name}</strong><ArrowUpRight size={11}/></button>
              {(canEdit || canProjects) && <button type="button" className="icon-button plan-icon" aria-label={t('Phasen von {name} bearbeiten', { name: project.name })} title={t('Phasen bearbeiten')} onClick={() => setModal({ type: 'phases', projectId: project.id })}><Layers size={14}/></button>}
              {canEdit && <button type="button" className="icon-button plan-icon" aria-label={t('Zeile zu {name} hinzufügen', { name: project.name })} title={t('Zeile hinzufügen')} onClick={() => setModal({ type: 'row', projectId: project.id })}><Plus size={14}/></button>}</div>
              <small className={offered > 0 && block.total > offered ? 'plan-meta plan-meta-over' : 'plan-meta'}>{offered > 0 ? t('{planned} von {offered} h geplant', { planned: h(block.total), offered: h(offered) }) : t('{planned} h geplant', { planned: h(block.total) })}{booked > 0 && <> · {t('{booked} h gebucht', { booked: h(booked) })}</>}</small></th>
              <td className="plan-sum"><Budget planned={block.total} offered={offered} booked={booked}/></td>
              <td colSpan={weeks.length} className="plan-phase-cell"><div className="plan-phases" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>{visiblePhases.map((ph) => { const plan = loaded.phasePlan.get(ph.id) ?? 0, done = loaded.phaseBooked.get(ph.id) ?? 0; const info = [ph.starts_on && ph.ends_on ? `${shortDate(ph.starts_on)} – ${shortDate(ph.ends_on)}` : '', ph.budget_minutes ? t('Budget {hours} h', { hours: h(ph.budget_minutes) }) : '', t('{planned} h geplant', { planned: h(plan) }), done ? t('{booked} h gebucht', { booked: h(done) }) : ''].filter(Boolean).join(' · ');
                return <span key={ph.id} className={ph.budget_minutes > 0 && Math.max(plan, done) > ph.budget_minutes ? 'plan-phase plan-phase-over' : 'plan-phase'} style={{ gridColumn: `${ph.from + 1} / ${ph.to + 2}`, '--phase-color': project.color } as CSSProperties} title={`${ph.name}: ${info}`}><strong>{ph.name}</strong><small>{info}</small></span>; })}
                {!visiblePhases.length && <span className="plan-phase-empty muted" style={{ gridColumn: `1 / ${weeks.length + 1}` }}>{block.phases.length ? t('Keine Phase in diesem Zeitraum') : t('Noch keine Phasen')}</span>}</div></td>
            </tr>
            {block.rows.map((row) => { rowIndex++; const r = rowIndex; const name = row.user_id ? memberName(row.user_id) : row.note ? t('Offen ({note})', { note: row.note }) : t('Offen');
              return <tr key={row.id} className={row.user_id ? 'plan-row' : 'plan-row plan-row-open'}>
                <th scope="row" className="plan-label"><div className="plan-row-label">{row.service_type_id && <span className="plan-role">{typeName(row.service_type_id)}</span>}<span className="plan-row-name">{name}</span>{canEdit && <button type="button" className="icon-button plan-icon" aria-label={t('Zeile {name} bearbeiten', { name })} title={t('Zeile bearbeiten')} onClick={() => setModal({ type: 'row', row: planRows.find((x) => x.id === row.id) })}><Pencil size={13}/></button>}</div></th>
                <td className="plan-sum" title={row.offered_minutes != null ? t('{planned} von {offered} h geplant', { planned: h(row.total), offered: h(row.offered_minutes) }) : undefined}><span className={row.offered_minutes != null && row.total > row.offered_minutes ? 'plan-negative' : ''}>{h(row.total)}</span>{row.offered_minutes != null && <small> / {h(row.offered_minutes)}</small>}</td>
                {weeks.map((w, c) => <HourCell key={w.start} minutes={row.cells[c]} actual={row.actual[c]} editable={canEdit} locale={locale} current={w.current} label={t('{name}, {project}, KW {week}: Stunden', { name, project: project.name, week: w.week })} actualLabel={t('{hours} h gebucht', { hours: h(row.actual[c]) })} coords={`${r}:${c}`} row={r} col={c} inFill={!!fill && fill.r === r && c >= Math.min(fill.from, fill.to) && c <= Math.max(fill.from, fill.to)} onCommit={(m) => saveCell(row, w.start, m)} onMove={(dr) => focusCell(r + dr, c)} onCopyRight={(m) => copyRight(row, r, c, m)} onFillStart={(e) => fillStart(e, r, c)} onFillMove={fillMove} onFillEnd={(e) => fillEnd(e, row)} fillLabel={t('Wert in weitere Wochen ziehen')}/>)}
              </tr>; })}
            <tr className="plan-total"><th scope="row" className="plan-label">{t('Summe {name}', { name: project.code })}</th><td className="plan-sum">{h(block.total)}</td>{block.planned.map((m, i) => <td key={i}>{m ? h(m) : ''}{block.actual[i] > 0 && <small className="plan-actual" title={t('{hours} h gebucht', { hours: h(block.actual[i]) })}>{h(block.actual[i])}</small>}</td>)}</tr>
          </tbody>; })}
      </table>
    </div></section>
    <p className="tiny muted plan-hint">{canEdit ? t('Stunden direkt in die Zelle tippen (7,5 oder 1:30). Enter und Pfeiltasten springen zur nächsten Zeile. Kleine Zahl unter dem Plan = gebuchte Stunden dieser Woche.') : t('Kleine Zahl unter dem Plan = gebuchte Stunden dieser Woche.')}</p>
    {dialogs}
  </>;
}

function PersonLine({ person, name, roles, weeks, h }: { person: MatrixPerson; name: string; roles: string; weeks: { start: string; week: number; current: boolean }[]; h: (m: number) => string }) {
  const { t } = useI18n();
  return <tr className="plan-person"><th scope="row" className="plan-label"><div className="person-cell"><span className="avatar tiny-avatar">{initials(name)}</span><div><strong>{name}</strong>{roles && <small className="muted">{roles}</small>}</div></div></th><td className="plan-sum"/>
    {weeks.map((w, i) => { const level = freeLevel(person, i), free = person.free[i], available = person.available[i];
      const detail = available == null ? t('{planned} h geplant, Arbeitszeitmodell nicht gepflegt', { planned: h(person.planned[i]) }) : [t('{available} h verfügbar', { available: h(available) }), t('{planned} h geplant', { planned: h(person.planned[i]) }), person.absent[i] > 0 ? t('{absent} h abwesend', { absent: h(person.absent[i]) }) : ''].filter(Boolean).join(' · ');
      return <td key={w.start} className={`plan-free-cell plan-${level}${w.current ? ' week-current' : ''}`} title={detail}><span aria-label={`${name}, ${t('KW {week}', { week: w.week })}: ${detail}`}>{free == null ? (person.planned[i] ? `${h(person.planned[i])}?` : '') : level === 'off' ? '–' : `${free < 0 ? '−' : ''}${h(Math.abs(free))}`}</span></td>; })}
  </tr>;
}

/** Schmaler Balken: geplant und gebucht gegen das Angebot. */
function Budget({ planned, offered, booked }: { planned: number; offered: number; booked: number }) {
  if (!offered) return null;
  const scale = Math.max(offered, planned, booked);
  return <span className="plan-budget" aria-hidden="true"><span className={planned > offered ? 'plan-budget-plan over' : 'plan-budget-plan'} style={{ width: `${planned / scale * 100}%` }}/><span className="plan-budget-booked" style={{ width: `${booked / scale * 100}%` }}/><span className="plan-budget-mark" style={{ left: `${offered / scale * 100}%` }}/></span>;
}

function HourCell({ minutes, actual, editable, locale, current, label, actualLabel, coords, row, col, inFill, onCommit, onMove, onCopyRight, onFillStart, onFillMove, onFillEnd, fillLabel }: { minutes: number; actual: number; editable: boolean; locale: string; current: boolean; label: string; actualLabel: string; coords: string; row: number; col: number; inFill: boolean; onCommit: (minutes: number) => void; onMove: (rows: number) => void; onCopyRight: (minutes: number) => void; onFillStart: (e: ReactPointerEvent<HTMLElement>) => void; onFillMove: (e: ReactPointerEvent<HTMLElement>) => void; onFillEnd: (e: ReactPointerEvent<HTMLElement>) => void; fillLabel: string }) {
  const [text, setTextState] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // Der Entwurf liegt zusätzlich in einem Ref: Enter speichert und springt weiter, das folgende „blur“ darf nicht noch einmal speichern.
  const draft = useRef<string | null>(null);
  const setText = (value: string | null) => { draft.current = value; setTextState(value); };
  const shown = text ?? (minutes ? hoursText(minutes, locale) : '');
  const commit = () => { const current = draft.current; if (current == null) return true; const value = parseHours(current); if (value == null) { setInvalid(true); return false; } setInvalid(false); setText(null); onCommit(value); return true; };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    // Alt + Pfeil rechts übernimmt den Wert in die nächste Woche – das Ziehen am Griff, nur mit der Tastatur.
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); const value = draft.current == null ? minutes : parseHours(draft.current); if (value != null && commit()) onCopyRight(value); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (commit()) onMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (commit()) onMove(-1); }
    else if (e.key === 'Escape' && text != null) { e.preventDefault(); e.stopPropagation(); setText(null); setInvalid(false); }
  };
  return <td className={`plan-cell${minutes ? ' plan-cell-set' : ''}${current ? ' week-current' : ''}${inFill ? ' plan-cell-fill' : ''}`} data-fill-row={editable ? row : undefined} data-fill-col={editable ? col : undefined}>
    {editable ? <input className="plan-input" inputMode="decimal" autoComplete="off" value={shown} aria-label={label} aria-invalid={invalid || undefined} data-plan-cell={coords} onChange={(e) => { setText(e.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={key} onFocus={(e) => e.target.select()}/> : <span className="plan-value">{shown}</span>}
    {actual > 0 && <small className="plan-actual" title={actualLabel}>{hoursText(actual, locale)}</small>}
    {editable && minutes > 0 && <span className="plan-fill-handle" title={fillLabel} aria-hidden="true" onPointerDown={onFillStart} onPointerMove={onFillMove} onPointerUp={onFillEnd} onPointerCancel={onFillEnd}/>}
  </td>;
}

function RowDialog({ row, projectId, projects, members, serviceTypes, planRows, workspace, service, run, busy, today, onClose }: { row?: PlanRow; projectId?: string; projects: Project[]; members: Membership[]; serviceTypes: ServiceType[]; planRows: PlanRow[]; workspace: Workspace; service: Service; run: Run; busy: boolean; today: string; onClose: () => void }) {
  const { t } = useI18n();
  const [project, setProject] = useState(row?.project_id ?? projectId ?? projects[0]?.id ?? '');
  const [user, setUser] = useState(row?.user_id ?? '');
  const [type, setType] = useState(row?.service_type_id ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); const f = new FormData(e.currentTarget);
    const offeredText = String(f.get('offered') ?? '').trim(), offered = offeredText === '' ? null : Math.round(Number(offeredText.replace(',', '.')) * 60);
    if (offered != null && (!Number.isFinite(offered) || offered < 0)) { setError(t('Bitte die angebotenen Stunden als Zahl eingeben.')); return; }
    const fillFrom = String(f.get('fill_from') ?? ''), fillTo = String(f.get('fill_to') ?? ''), fillText = String(f.get('fill_hours') ?? '').trim();
    const fill = fillText === '' ? null : parseHours(fillText);
    if (fillText !== '' && (fill == null || !fillFrom || !fillTo || fillFrom > fillTo)) { setError(t('Zum Füllen braucht es Stunden je Woche und einen Zeitraum, dessen Ende nicht vor dem Beginn liegt.')); return; }
    if (!project) { setError(t('Bitte ein Projekt wählen.')); return; }
    const id = row?.id ?? crypto.randomUUID();
    const position = row?.position ?? Math.max(0, ...planRows.filter((r) => r.project_id === project).map((r) => r.position)) + 1;
    const ok = await run(async () => {
      await service.savePlanRow({ id, workspace_id: workspace.id, project_id: project, user_id: user || null, service_type_id: type || null, offered_minutes: offered, note: String(f.get('note') ?? '').trim(), position });
      if (fill != null) { const cells: PlanCell[] = []; for (let week = mondayOf(fillFrom); week <= fillTo && cells.length < 160; week = shiftDate(week, 7)) cells.push({ workspace_id: workspace.id, row_id: id, week_start: week, minutes: fill }); await service.setPlanCells(cells); }
    }, row ? t('Zeile gespeichert.') : t('Zeile hinzugefügt.'));
    if (ok) onClose(); else setError(t('Die Änderung wurde nicht bestätigt. Prüfe den Hinweis im Workspace und versuche es erneut.'));
  };
  const remove = async () => { if (!row) return; if (!confirmDelete) { setConfirmDelete(true); return; } if (await run(() => service.deletePlanRow(row.id), t('Zeile gelöscht.'))) onClose(); };
  return <Dialog title={row ? t('Planzeile bearbeiten') : t('Zeile hinzufügen')} onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}>
    {error && <Notice>{error}</Notice>}
    <Field label={t('Projekt')}><SelectMenu label={t('Projekt')} value={project} onChange={setProject} disabled={!!row} placeholder={t('Projekt auswählen')} options={projects.filter((p) => p.status === 'active' || p.id === project).map((p) => projectOption(p))}/></Field>
    <div className="form-grid"><Field label={t('Leistungsart')}><SelectMenu label={t('Leistungsart')} value={type} onChange={setType} options={[{ value: '', label: t('Ohne Leistungsart') }, ...serviceTypes.filter((s) => s.active || s.id === type).map((s) => ({ value: s.id, label: s.name }))]}/></Field>
      <Field label={t('Person')}><SelectMenu label={t('Person')} value={user} onChange={setUser} options={[{ value: '', label: t('Offen – noch niemand') }, ...members.map((m) => memberOption(m))]}/></Field></div>
    <div className="form-grid"><Field label={t('Angebotene Stunden')} hint={t('Leer = kein Vergleich für diese Zeile')}><input name="offered" inputMode="decimal" defaultValue={row?.offered_minutes != null ? String(row.offered_minutes / 60) : ''}/></Field>
      <Field label={t('Notiz')} hint={t('Zum Beispiel: Freelancer gesucht')}><input name="note" maxLength={240} defaultValue={row?.note ?? ''}/></Field></div>
    <fieldset className="plan-fill"><legend>{t('Zeitraum füllen (optional)')}</legend><p className="tiny muted">{t('Trägt dieselben Stunden in jede Kalenderwoche des Zeitraums ein. Vorhandene Werte dort werden überschrieben, 0 leert sie.')}</p>
      <div className="form-grid plan-fill-grid"><Field label={t('Stunden je Woche')}><input name="fill_hours" inputMode="decimal" placeholder="16"/></Field><Field label={t('Von')}><input type="date" name="fill_from" min="2000-01-01" max="2100-12-31" defaultValue={mondayOf(today)}/></Field><Field label={t('Bis')}><input type="date" name="fill_to" min="2000-01-01" max="2100-12-31" defaultValue={shiftDate(mondayOf(today), 27)}/></Field></div></fieldset>
    {row && <button type="button" className="text-button danger" disabled={busy} onClick={remove}><Trash2 size={14}/> {confirmDelete ? t('Wirklich löschen? Die Wochenwerte der Zeile gehen verloren.') : t('Zeile löschen')}</button>}
    <FormActions busy={busy} onClose={onClose}/>
  </form></Dialog>;
}

interface PhaseDraft { id?: string; name: string; starts_on: string; ends_on: string; hours: string }
function PhasesDialog({ project, phases, planned, booked, workspace, service, run, busy, onClose }: { project: Project; phases: ProjectPhase[]; planned: Map<string, number>; booked: Map<string, number>; workspace: Workspace; service: Service; run: Run; busy: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<PhaseDraft[]>(() => [...phases].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, name: p.name, starts_on: p.starts_on ?? '', ends_on: p.ends_on ?? '', hours: p.budget_minutes ? String(p.budget_minutes / 60) : '' })));
  const [error, setError] = useState('');
  const patch = (i: number, change: Partial<PhaseDraft>) => setList((l) => l.map((p, n) => n === i ? { ...p, ...change } : p));
  const add = () => setList((l) => { const last = l[l.length - 1]; const start = last?.ends_on ? shiftDate(last.ends_on, 1) : ''; return [...l, { name: '', starts_on: start, ends_on: start ? shiftDate(start, 27) : '', hours: '' }]; });
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const kept = list.filter((p) => p.name.trim() || p.id);
    if (kept.some((p) => !p.name.trim())) { setError(t('Jede Phase braucht einen Namen.')); return; }
    if (kept.some((p) => p.starts_on && p.ends_on && p.ends_on < p.starts_on)) { setError(t('Das Ende liegt vor dem Beginn.')); return; }
    if (new Set(kept.map((p) => p.name.trim().toLowerCase())).size !== kept.length) { setError(t('Jeder Phasenname darf im Projekt nur einmal vorkommen.')); return; }
    const budgets = kept.map((p) => p.hours.trim() === '' ? 0 : Math.round(Number(p.hours.replace(',', '.')) * 60));
    if (budgets.some((m) => !Number.isFinite(m) || m < 0)) { setError(t('Bitte das Budget in Stunden als Zahl eingeben.')); return; }
    const removed = phases.filter((p) => !kept.some((k) => k.id === p.id));
    const ok = await run(async () => {
      for (const p of removed) await service.deletePhase(p.id);
      for (const [i, p] of kept.entries()) await service.savePhase({ id: p.id ?? crypto.randomUUID(), workspace_id: workspace.id, project_id: project.id, name: p.name.trim(), position: i + 1, starts_on: p.starts_on || null, ends_on: p.ends_on || null, budget_minutes: budgets[i] });
    }, t('Phasen gespeichert.'));
    if (ok) onClose(); else setError(t('Die Änderung wurde nicht bestätigt. Prüfe den Hinweis im Workspace und versuche es erneut.'));
  };
  const h = (m: number) => hoursText(m, locale);
  return <Dialog title={t('Phasen')} description={project.name} onClose={onClose} busy={busy} wide><form className="form-stack" onSubmit={submit}>
    {error && <Notice>{error}</Notice>}
    <p className="tiny muted">{t('Phasen gliedern das Projekt zwischen Projekt und Aufgabe. Zeiten werden auf die Phase gebucht; liegt der Tag in genau einer Phase, wählt das Tool sie von selbst.')}</p>
    <div className="phase-list" role="list">{list.map((p, i) => <div className="phase-row" role="listitem" key={p.id ?? `new-${i}`}>
      <label className="field"><span>{t('Phase')}</span><input value={p.name} maxLength={120} placeholder={t('Zum Beispiel: Concept Design')} onChange={(e) => patch(i, { name: e.target.value })}/></label>
      <label className="field"><span>{t('Von')}</span><input type="date" min="2000-01-01" max="2100-12-31" value={p.starts_on} onChange={(e) => patch(i, { starts_on: e.target.value })}/></label>
      <label className="field"><span>{t('Bis')}</span><input type="date" min="2000-01-01" max="2100-12-31" value={p.ends_on} onChange={(e) => patch(i, { ends_on: e.target.value })}/></label>
      <label className="field"><span>{t('Budget (h)')}</span><input inputMode="decimal" value={p.hours} placeholder="0" onChange={(e) => patch(i, { hours: e.target.value })}/></label>
      <div className="phase-facts">{p.id ? <><span>{t('{planned} h geplant', { planned: h(planned.get(p.id) ?? 0) })}</span><span>{t('{booked} h gebucht', { booked: h(booked.get(p.id) ?? 0) })}</span></> : <span className="muted">{t('neu')}</span>}</div>
      <button type="button" className="icon-button" aria-label={t('Phase {name} entfernen', { name: p.name || String(i + 1) })} title={t('Phase entfernen')} onClick={() => setList((l) => l.filter((_, n) => n !== i))}><Trash2 size={15}/></button>
    </div>)}</div>
    {!list.length && <p className="muted">{t('Noch keine Phasen. Typisch sind Pitch, Discovery, Concept Design, Schematic Design und Supervision.')}</p>}
    <button type="button" className="button secondary small phase-add" onClick={add}><Plus size={14}/> {t('Phase hinzufügen')}</button>
    {phases.some((p) => !list.some((k) => k.id === p.id)) && <Notice kind="info">{t('Entfernte Phasen werden beim Speichern gelöscht. Bereits gebuchte Zeiten bleiben erhalten und stehen dann ohne Phase da.')}</Notice>}
    <FormActions busy={busy} onClose={onClose}/>
  </form></Dialog>;
}

function ServiceTypesDialog({ serviceTypes, workspace, service, run, busy, onClose }: { serviceTypes: ServiceType[]; workspace: Workspace; service: Service; run: Run; busy: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState(() => serviceTypes.map((s) => ({ id: s.id as string | undefined, name: s.name, active: s.active })));
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const kept = list.filter((s) => s.name.trim());
    if (new Set(kept.map((s) => s.name.trim().toLowerCase())).size !== kept.length) { setError(t('Jede Leistungsart darf nur einmal vorkommen.')); return; }
    const removed = serviceTypes.filter((s) => !kept.some((k) => k.id === s.id));
    const ok = await run(async () => {
      for (const s of removed) await service.deleteServiceType(s.id);
      for (const [i, s] of kept.entries()) { const before = serviceTypes.find((x) => x.id === s.id); if (!before || before.name !== s.name.trim() || before.position !== i + 1 || before.active !== s.active) await service.saveServiceType({ id: s.id ?? crypto.randomUUID(), workspace_id: workspace.id, name: s.name.trim(), position: i + 1, active: s.active }); }
    }, t('Leistungsarten gespeichert.'));
    if (ok) onClose(); else setError(t('Die Änderung wurde nicht bestätigt. Prüfe den Hinweis im Workspace und versuche es erneut.'));
  };
  return <Dialog title={t('Leistungsarten')} onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}>
    {error && <Notice>{error}</Notice>}
    <p className="tiny muted">{t('Die Rollen, in denen ihr an Projekten arbeitet – zum Beispiel PM, CD, Konzept, 3D. Der Kapazitätsplan und die Zeiterfassung nutzen dieselbe Liste.')}</p>
    <div className="type-list">{list.map((s, i) => <div className="type-row" key={s.id ?? `new-${i}`}>
      <input aria-label={t('Leistungsart {n}', { n: i + 1 })} value={s.name} maxLength={60} placeholder={t('Zum Beispiel: 3D')} onChange={(e) => setList((l) => l.map((x, n) => n === i ? { ...x, name: e.target.value } : x))}/>
      <label className="checkbox-field"><input type="checkbox" checked={s.active} onChange={(e) => setList((l) => l.map((x, n) => n === i ? { ...x, active: e.target.checked } : x))}/> {t('aktiv')}</label>
      <button type="button" className="icon-button" aria-label={t('Leistungsart {name} entfernen', { name: s.name || String(i + 1) })} onClick={() => setList((l) => l.filter((_, n) => n !== i))}><Trash2 size={15}/></button>
    </div>)}</div>
    <button type="button" className="button secondary small phase-add" onClick={() => setList((l) => [...l, { id: undefined, name: '', active: true }])}><Plus size={14}/> {t('Leistungsart hinzufügen')}</button>
    {serviceTypes.some((s) => !list.some((k) => k.id === s.id)) && <Notice kind="info">{t('Entfernte Leistungsarten verschwinden aus Planzeilen und gebuchten Zeiten. Zum Ausblenden genügt es, „aktiv“ abzuwählen.')}</Notice>}
    <FormActions busy={busy} onClose={onClose}/>
  </form></Dialog>;
}

