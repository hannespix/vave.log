import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, CalendarPlus, ChevronLeft, ChevronRight, Flag, Plus, Trash2 } from 'lucide-react';
import type { Project, ProjectPhase, Task, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { isoWeek } from '../shared/capacity';
import { hoursText, parseHours } from '../shared/capacity-matrix';
import { shiftDate } from '../shared/holidays';
import { assignLanes, barFor, dayIndex, daysBetween, dragSpan, freeName, monthSegments, snapDays, spanBetween, timelineRange, weekStarts, type DragMode, type Span } from '../shared/timeline';
import { Dialog, Empty, Field, FormActions, Notice } from './components';
import { SelectMenu } from './select-menu';
import { useI18n } from './i18n';
import { shortDate } from './helpers';
import './timeline.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
interface Props { projects: Project[]; phases: ProjectPhase[]; tasks: Task[]; workspace: Workspace; service: Service; run: Run; busy: boolean; today: string; canEdit: boolean; canTasks: boolean; onOpenProject: (id: string) => void }
type Editing = { phase: ProjectPhase } | { create: { project: Project; span: Span } };
interface PhaseDrag { kind: 'phase'; id: string; mode: DragMode; startX: number; dayWidth: number; origin: Span; moved: boolean }
interface NewDrag { kind: 'new'; projectId: string; startX: number; dayWidth: number; a: number; b: number }
interface MilestoneDrag { kind: 'milestone'; id: string; startX: number; dayWidth: number; origin: string; moved: boolean }

const ZOOMS = [{ weeks: 13, label: '3 Monate', step: 1, weekPx: 48 }, { weeks: 26, label: '6 Monate', step: 1, weekPx: 28 }, { weeks: 52, label: '12 Monate', step: 7, weekPx: 17 }] as const;
const LANE = 34, PAD = 10, MARKS = 22;
const ZOOM_KEY = 'vave-log.timeline-weeks';
const readZoom = () => { try { const v = Number(localStorage.getItem(ZOOM_KEY)); return ZOOMS.some((z) => z.weeks === v) ? v : 26; } catch { return 26; } };

/**
 * Zeitstrahl: Projekte als Zeilen, Phasen als Balken. Balken lassen sich verschieben und an den Rändern
 * ziehen; auf freier Fläche zieht man eine neue Phase auf. Meilensteine sind Rauten und wandern mit dem Zeiger.
 * Alles geht auch mit der Tastatur: Pfeiltasten verschieben, Alt + Pfeil ändert das Ende, Eingabe öffnet die Phase.
 */
export function TimelineArea({ projects, phases, tasks, workspace, service, run, busy, today, canEdit, canTasks, onOpenProject }: Props) {
  const { t, locale } = useI18n();
  const [weeks, setWeeks] = useState(readZoom); const [offset, setOffset] = useState(0); const [projectId, setProjectId] = useState('');
  const [draft, setDraft] = useState<Record<string, Span>>({}); const [dates, setDates] = useState<Record<string, string>>({});
  const [band, setBand] = useState<{ projectId: string; span: Span } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null); const [active, setActive] = useState('');
  const drag = useRef<PhaseDrag | NewDrag | MilestoneDrag | null>(null); const timer = useRef(0);
  // Nach dem Speichern ersetzt der Stand vom Server die vorläufigen Positionen.
  const [wasBusy, setWasBusy] = useState(busy);
  if (wasBusy !== busy) { setWasBusy(busy); if (!busy && (Object.keys(draft).length || Object.keys(dates).length)) { setDraft({}); setDates({}); } }
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const zoom = ZOOMS.find((z) => z.weeks === weeks) ?? ZOOMS[1];
  const range = timelineRange(today, weeks, offset);
  const choose = (w: number) => { setWeeks(w); try { localStorage.setItem(ZOOM_KEY, String(w)); } catch { /* gilt bis zum Neuladen */ } };
  const visible = projects.filter((p) => p.status !== 'archived' && (!projectId || p.id === projectId));
  const spanOf = (p: ProjectPhase): Span | null => draft[p.id] ?? (p.starts_on && p.ends_on ? { starts_on: p.starts_on, ends_on: p.ends_on } : null);
  const months = monthSegments(range), mondays = weekStarts(range);
  const monthName = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const todayIndex = dayIndex(range, today);
  const period = (s: Span) => `${shortDate(s.starts_on)} – ${shortDate(s.ends_on)}`;

  const savePhase = (phase: ProjectPhase, span: Span) => {
    if (phase.starts_on === span.starts_on && phase.ends_on === span.ends_on) { setDraft((d) => { const { [phase.id]: _, ...rest } = d; return rest; }); return; }
    void run(() => service.savePhase({ id: phase.id, workspace_id: phase.workspace_id, project_id: phase.project_id, name: phase.name, position: phase.position, starts_on: span.starts_on, ends_on: span.ends_on, budget_minutes: phase.budget_minutes }))
      .then((ok) => { if (!ok) setDraft((d) => { const { [phase.id]: _, ...rest } = d; return rest; }); });
  };
  const saveMilestone = (task: Task, due: string) => {
    if (task.due_date === due) { setDates((d) => { const { [task.id]: _, ...rest } = d; return rest; }); return; }
    void run(() => service.saveTask({ id: task.id, workspace_id: task.workspace_id, project_id: task.project_id, title: task.title, status: task.status, assignee_id: task.assignee_id, due_date: due }))
      .then((ok) => { if (!ok) setDates((d) => { const { [task.id]: _, ...rest } = d; return rest; }); });
  };
  const laneWidth = (el: HTMLElement) => (el.closest<HTMLElement>('.tl-lane')?.getBoundingClientRect().width ?? 1) / range.days;

  function phaseDown(e: ReactPointerEvent<HTMLDivElement>, phase: ProjectPhase, span: Span) {
    if (!canEdit || busy || e.button !== 0) return;
    const mode = ((e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle ?? 'move') as DragMode;
    drag.current = { kind: 'phase', id: phase.id, mode, startX: e.clientX, dayWidth: laneWidth(e.currentTarget), origin: span, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId); setActive(phase.id); e.stopPropagation();
  }
  function phaseMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.kind !== 'phase') return;
    const delta = snapDays((e.clientX - d.startX) / d.dayWidth, zoom.step);
    if (delta !== 0 || d.moved) { d.moved = true; setDraft((prev) => ({ ...prev, [d.id]: dragSpan(d.origin, d.mode, delta) })); }
  }
  function phaseUp(e: ReactPointerEvent<HTMLDivElement>, phase: ProjectPhase) {
    const d = drag.current; drag.current = null; setActive('');
    if (!d || d.kind !== 'phase') return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) { setEditing({ phase }); return; }
    savePhase(phase, dragSpan(d.origin, d.mode, snapDays((e.clientX - d.startX) / d.dayWidth, zoom.step)));
  }
  function phaseKey(e: ReactKeyboardEvent<HTMLDivElement>, phase: ProjectPhase, span: Span) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing({ phase }); return; }
    if (!canEdit || busy || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const next = dragSpan(span, e.altKey ? 'end' : 'move', (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1));
    setDraft((prev) => ({ ...prev, [phase.id]: next }));
    // Mehrere Tastendrücke hintereinander werden zu einer Speicherung.
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => savePhase(phase, next), 700);
  }
  function laneDown(e: ReactPointerEvent<HTMLDivElement>, project: Project) {
    // Aufziehen nur mit Maus oder Stift: Mit dem Finger wird hier gescrollt; dafür gibt es den Knopf „Phase hinzufügen“.
    if (!canEdit || busy || e.button !== 0 || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect(), dayWidth = rect.width / range.days;
    const a = Math.max(0, Math.min(range.days - 1, Math.floor((e.clientX - rect.left) / dayWidth)));
    drag.current = { kind: 'new', projectId: project.id, startX: e.clientX, dayWidth, a, b: a };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function laneMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.kind !== 'new') return;
    const rect = e.currentTarget.getBoundingClientRect();
    d.b = Math.max(0, Math.min(range.days - 1, Math.floor((e.clientX - rect.left) / d.dayWidth)));
    if (Math.abs(e.clientX - d.startX) > 4) setBand({ projectId: d.projectId, span: spanBetween(range, d.a, d.b) });
  }
  function laneUp(e: ReactPointerEvent<HTMLDivElement>, project: Project) {
    const d = drag.current; drag.current = null;
    if (!d || d.kind !== 'new') return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setBand(null);
    if (Math.abs(e.clientX - d.startX) <= 4) return;
    let span = spanBetween(range, d.a, d.b);
    if (zoom.step > 1) span = { starts_on: shiftDate(span.starts_on, -((new Date(`${span.starts_on}T12:00:00Z`).getUTCDay() + 6) % 7)), ends_on: shiftDate(span.ends_on, (7 - new Date(`${span.ends_on}T12:00:00Z`).getUTCDay()) % 7) };
    setEditing({ create: { project, span } });
  }
  function milestoneDown(e: ReactPointerEvent<HTMLButtonElement>, task: Task, due: string) {
    if (!canTasks || busy || e.button !== 0) return;
    drag.current = { kind: 'milestone', id: task.id, startX: e.clientX, dayWidth: laneWidth(e.currentTarget), origin: due, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId); e.stopPropagation();
  }
  function milestoneMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d || d.kind !== 'milestone') return;
    const delta = Math.round((e.clientX - d.startX) / d.dayWidth);
    if (delta !== 0 || d.moved) { d.moved = true; setDates((prev) => ({ ...prev, [d.id]: shiftDate(d.origin, delta) })); }
  }
  function milestoneUp(e: ReactPointerEvent<HTMLButtonElement>, task: Task) {
    const d = drag.current; drag.current = null;
    if (!d || d.kind !== 'milestone') return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) saveMilestone(task, shiftDate(d.origin, Math.round((e.clientX - d.startX) / d.dayWidth)));
  }
  function milestoneKey(e: ReactKeyboardEvent<HTMLButtonElement>, task: Task, due: string) {
    if (!canTasks || busy || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const next = shiftDate(due, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1));
    setDates((prev) => ({ ...prev, [task.id]: next }));
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => saveMilestone(task, next), 700);
  }
  const addPhase = (project: Project) => {
    const own = phases.filter((p) => p.project_id === project.id);
    const last = own.map((p) => p.ends_on).filter((d): d is string => !!d).sort().pop();
    const start = last && last >= today ? shiftDate(last, 1) : today;
    setEditing({ create: { project, span: { starts_on: start, ends_on: shiftDate(start, 13) } } });
  };

  const style = { '--weeks': weeks, '--tl-min': `${weeks * zoom.weekPx}px` } as CSSProperties;
  return <section className="panel timeline-panel">
    <div className="tl-toolbar">
      <div className="button-row"><button className="icon-button" onClick={() => setOffset((o) => o - Math.max(4, Math.round(weeks / 3)))} aria-label={t('Früher')}><ChevronLeft size={18}/></button><button className="button secondary small" onClick={() => setOffset(0)}>{t('Heute')}</button><button className="icon-button" onClick={() => setOffset((o) => o + Math.max(4, Math.round(weeks / 3)))} aria-label={t('Später')}><ChevronRight size={18}/></button></div>
      <div className="segmented tl-zoom" aria-label={t('Zeitraum')}>{ZOOMS.map((z) => <button key={z.weeks} className={weeks === z.weeks ? 'selected' : ''} aria-pressed={weeks === z.weeks} onClick={() => choose(z.weeks)}>{t(z.label)}</button>)}</div>
      <SelectMenu compact label={t('Projekt')} value={projectId} onChange={setProjectId} options={[{ value: '', label: t('Alle Projekte') }, ...projects.filter((p) => p.status !== 'archived').map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))]}/>
    </div>
    <p className="muted tl-hint">{canEdit ? t('Balken ziehen verschiebt die Phase, an den Rändern ziehen ändert Beginn oder Ende. Auf freier Fläche ziehst du eine neue Phase auf.') : t('Phasen und Meilensteine aller Projekte auf einen Blick.')}</p>
    {!visible.length ? <Empty title={t('Noch kein Projekt auf dem Zeitstrahl.')} text={t('Sobald es ein aktives Projekt gibt, planst du hier seine Phasen.')}/> :
    <div className="table-scroll tl-scroll" tabIndex={0} role="region" aria-label={t('Zeitstrahl')}><div className={`tl${active || band ? ' tl-dragging' : ''}`} style={style}>
      <div className="tl-head"><div className="tl-side tl-side-head">{t('Projekt')}</div><div className="tl-scale">
        <div className="tl-months">{months.map((m) => <span key={m.key} style={{ flexGrow: m.days }}>{m.days >= 10 ? monthName.format(new Date(Date.UTC(m.year, m.month - 1, 1))) : ''}</span>)}</div>
        <div className="tl-weeks">{mondays.map((monday) => <span key={monday} className={monday <= today && shiftDate(monday, 6) >= today ? 'tl-now' : ''} title={`${shortDate(monday)} – ${shortDate(shiftDate(monday, 6))}`}>{weeks <= 26 ? t('KW {week}', { week: isoWeek(monday) }) : isoWeek(monday)}</span>)}</div>
      </div></div>
      {visible.map((project) => {
        const own = phases.filter((p) => p.project_id === project.id);
        const placed = own.flatMap((p) => { const span = spanOf(p); return span ? [{ phase: p, span, id: p.id, order: p.position, ...span }] : []; });
        const loose = own.filter((p) => !spanOf(p));
        const { lanes, count } = assignLanes(placed);
        const marks = tasks.filter((task) => task.project_id === project.id && task.is_milestone && (dates[task.id] ?? task.due_date));
        const height = PAD * 2 + count * LANE + (marks.length || project.due_date ? MARKS : 0);
        const ends = placed.map((p) => p.span.ends_on).sort().pop(), starts = placed.map((p) => p.span.starts_on).sort()[0];
        const due = project.due_date ? dayIndex(range, project.due_date) : -1;
        return <div className="tl-row" key={project.id}>
          <div className="tl-side"><div className="tl-project"><span className="tl-dot" style={{ background: project.color }} aria-hidden="true"/><button className="project-text-link" onClick={() => onOpenProject(project.id)}><strong>{project.name}</strong><ArrowUpRight size={13}/></button></div>
            <small className="muted">{project.code}{starts && ends ? ` · ${period({ starts_on: starts, ends_on: ends })}` : ''}</small>
            {loose.length > 0 && <div className="tl-loose">{loose.map((p) => <button key={p.id} className="tl-chip" disabled={!canEdit || busy} onClick={() => setEditing({ phase: p })} title={t('Ohne Zeitraum – anklicken, um ihn einzuplanen')}><CalendarPlus size={12}/> {p.name}</button>)}</div>}
            {canEdit && <button className="text-button tiny tl-add" disabled={busy} onClick={() => addPhase(project)} aria-label={t('Phase hinzufügen: {name}', { name: project.name })}><Plus size={13}/> {t('Phase')}</button>}
          </div>
          <div className={`tl-lane${canEdit ? ' tl-lane-edit' : ''}`} style={{ minHeight: height }} onPointerDown={(e) => laneDown(e, project)} onPointerMove={laneMove} onPointerUp={(e) => laneUp(e, project)} onPointerCancel={() => { drag.current = null; setBand(null); }}>
            {todayIndex >= 0 && todayIndex < range.days && <span className="tl-today" style={{ left: `${(todayIndex + 0.5) / range.days * 100}%` }} aria-hidden="true"/>}
            {due >= 0 && due < range.days && <span className="tl-due" style={{ left: `${(due + 1) / range.days * 100}%` }} title={t('Termin: {date}', { date: shortDate(project.due_date!) })}><Flag size={12}/></span>}
            {placed.map(({ phase, span }) => {
              const bar = barFor(range, span); if (!bar) return null;
              const days = daysBetween(span.starts_on, span.ends_on) + 1;
              const label = t('Phase {name}, {from} bis {to}', { name: phase.name, from: shortDate(span.starts_on), to: shortDate(span.ends_on) });
              return <div key={phase.id} className={`tl-bar${active === phase.id ? ' tl-bar-active' : ''}${bar.cutLeft ? ' tl-cut-left' : ''}${bar.cutRight ? ' tl-cut-right' : ''}${draft[phase.id] ? ' tl-bar-draft' : ''}`} role="button" tabIndex={0}
                aria-label={label} aria-description={canEdit ? t('Pfeiltasten verschieben um einen Tag, mit Umschalt um eine Woche. Alt und Pfeil ändert das Ende. Eingabe öffnet die Phase.') : undefined}
                title={`${phase.name} · ${period(span)} · ${t('{count} Tage', { count: days })}`}
                style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%`, top: PAD + (lanes.get(phase.id) ?? 0) * LANE, '--tl-color': project.color } as CSSProperties}
                onPointerDown={(e) => phaseDown(e, phase, span)} onPointerMove={phaseMove} onPointerUp={(e) => phaseUp(e, phase)} onPointerCancel={() => { drag.current = null; setActive(''); setDraft((d) => { const { [phase.id]: _, ...rest } = d; return rest; }); }}
                onKeyDown={(e) => phaseKey(e, phase, span)} onClick={() => { if (!canEdit) setEditing({ phase }); }}>
                {canEdit && !bar.cutLeft && <span className="tl-handle tl-handle-start" data-handle="start" aria-hidden="true"/>}
                <span className="tl-bar-name">{phase.name}</span>{bar.width * weeks * 7 >= 14 && <span className="tl-bar-dates">{draft[phase.id] ? period(span) : phase.budget_minutes ? `${hoursText(phase.budget_minutes, locale)} h` : ''}</span>}
                {canEdit && !bar.cutRight && <span className="tl-handle tl-handle-end" data-handle="end" aria-hidden="true"/>}
              </div>;
            })}
            {band?.projectId === project.id && (() => { const bar = barFor(range, band.span); return bar && <div className="tl-band" style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%`, top: PAD }}>{period(band.span)}</div>; })()}
            {marks.map((task) => {
              const day = dates[task.id] ?? task.due_date!; const i = dayIndex(range, day); if (i < 0 || i >= range.days) return null;
              return <button key={task.id} className={`tl-milestone${task.status === 'done' ? ' tl-done' : day < today ? ' tl-late' : ''}`} style={{ left: `${(i + 0.5) / range.days * 100}%`, top: PAD + count * LANE + 2 }} disabled={!canTasks}
                aria-label={t('Meilenstein {name}, {date}', { name: task.title, date: shortDate(day) })} title={`${task.title} · ${shortDate(day)}`}
                onPointerDown={(e) => milestoneDown(e, task, day)} onPointerMove={milestoneMove} onPointerUp={(e) => milestoneUp(e, task)} onKeyDown={(e) => milestoneKey(e, task, day)}><span aria-hidden="true"/></button>;
            })}
          </div>
        </div>;
      })}
    </div></div>}
    <div className="tl-legend" aria-hidden="true"><span><i className="tl-key tl-key-today"/>{t('Heute')}</span><span><i className="tl-key tl-key-milestone"/>{t('Meilenstein')}</span><span><Flag size={12}/>{t('Projekttermin')}</span></div>
    {editing && <PhaseEditor key={'phase' in editing ? editing.phase.id : 'new'} editing={editing} phases={phases} today={today} workspace={workspace} service={service} run={run} busy={busy} canEdit={canEdit} onClose={() => setEditing(null)}/>}
  </section>;
}

/** Phase anlegen oder ändern: Name, Zeitraum, Stundenbudget – und löschen. */
function PhaseEditor({ editing, phases, today, workspace, service, run, busy, canEdit, onClose }: { editing: Editing; phases: ProjectPhase[]; today: string; workspace: Workspace; service: Service; run: Run; busy: boolean; canEdit: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const phase = 'phase' in editing ? editing.phase : null;
  const projectId = phase ? phase.project_id : (editing as { create: { project: Project } }).create.project.id;
  const siblings = phases.filter((p) => p.project_id === projectId && p.id !== phase?.id);
  const initial = phase ? { starts_on: phase.starts_on ?? today, ends_on: phase.ends_on ?? shiftDate(phase.starts_on ?? today, 13) } : (editing as { create: { span: Span } }).create.span;
  const [name, setName] = useState(phase?.name ?? freeName(t('Neue Phase'), siblings.map((p) => p.name)));
  const [from, setFrom] = useState(initial.starts_on); const [to, setTo] = useState(initial.ends_on);
  const [hours, setHours] = useState(phase?.budget_minutes ? hoursText(phase.budget_minutes, locale) : ''); const [error, setError] = useState(''); const [confirming, setConfirming] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const clean = name.trim(), minutes = hours.trim() === '' ? 0 : parseHours(hours);
    if (!clean) { setError(t('Jede Phase braucht einen Namen.')); return; }
    if (siblings.some((p) => p.name.trim().toLowerCase() === clean.toLowerCase())) { setError(t('Jeder Phasenname darf im Projekt nur einmal vorkommen.')); return; }
    if (!from || !to || to < from) { setError(t('Das Ende liegt vor dem Beginn.')); return; }
    if (minutes == null) { setError(t('Bitte Stunden als Zahl eingeben, zum Beispiel 120 oder 37,5.')); return; }
    const position = phase ? phase.position : Math.max(0, ...siblings.map((p) => p.position)) + 1;
    void run(() => service.savePhase({ ...(phase ? { id: phase.id } : {}), workspace_id: workspace.id, project_id: projectId, name: clean, position, starts_on: from, ends_on: to, budget_minutes: minutes }), phase ? t('Phase gespeichert.') : t('Phase angelegt.')).then((ok) => { if (ok) onClose(); });
  };
  const remove = () => { if (phase) void run(() => service.deletePhase(phase.id), t('Phase gelöscht.')).then((ok) => { if (ok) onClose(); }); };
  return <Dialog title={phase ? 'Phase bearbeiten' : 'Neue Phase'} onClose={onClose} busy={busy}>
    <form className="form-stack" onSubmit={submit}>
      {error && <Notice>{error}</Notice>}
      <Field label="Name"><input value={name} maxLength={120} required autoFocus disabled={!canEdit} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setName(e.target.value)}/></Field>
      <div className="form-grid"><Field label="Beginn"><input type="date" value={from} required disabled={!canEdit} onChange={(e) => setFrom(e.target.value)}/></Field><Field label="Ende"><input type="date" value={to} min={from} required disabled={!canEdit} onChange={(e) => setTo(e.target.value)}/></Field></div>
      <Field label="Stundenbudget" hint="Optional. Der Kapazitätsplan zeigt daneben, wie viel geplant und gebucht ist."><input inputMode="decimal" value={hours} disabled={!canEdit} placeholder={t('z. B. 120')} onChange={(e) => setHours(e.target.value)}/></Field>
      {phase && canEdit && (confirming
        ? <div className="button-row"><button type="button" className="button danger small" disabled={busy} onClick={remove}>{t('Wirklich löschen')}</button><button type="button" className="button secondary small" disabled={busy} onClick={() => setConfirming(false)}>{t('Abbrechen')}</button><small className="muted">{t('Gebuchte Zeiten bleiben erhalten, verlieren aber die Phase.')}</small></div>
        : <div className="button-row"><button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={14}/> {t('Phase löschen')}</button></div>)}
      {canEdit ? <FormActions busy={busy} onClose={onClose} label={phase ? 'Speichern' : 'Phase anlegen'}/> : <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Schließen')}</button></div>}
    </form>
  </Dialog>;
}
