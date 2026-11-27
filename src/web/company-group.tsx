import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRightLeft, Building2, Check, Link2, Undo2, Unlink, X } from 'lucide-react';
import type { Project, ProjectHandover, SisterWorkspace, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { can, type Rights } from '../shared/rights';
import { Dialog, Field, FormActions, Notice } from './components';
import { SelectMenu } from './select-menu';
import { useI18n } from './i18n';
import { errorMessage, minutesLabel, shortDate } from './helpers';
import './company-group.css';

// React Flow wird nur geladen, wenn es eine Schwesterfirma gibt.
const CompanyMap = lazy(() => import('./company-map'));

/**
 * Firmenverbund. Jede Firma ist ein eigener Workspace; verknüpfte Workspaces sind Schwesterfirmen und
 * können einander Projekte übergeben. Die Rechte prüft die Datenbank in beiden Firmen.
 */

/** Einstellungen: Schwesterfirmen ansehen, verknüpfen, trennen. */
export function CompanyGroupPanel({ workspace, workspaces, canEdit, service }: { workspace: Workspace; workspaces: Workspace[]; canEdit: boolean; service: Service }) {
  const { t } = useI18n();
  const [sisters, setSisters] = useState<SisterWorkspace[] | null>(null);
  const [choice, setChoice] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [confirming, setConfirming] = useState('');
  const load = useCallback(() => service.listSisters(workspace.id).then(setSisters).catch(() => setSisters([])), [service, workspace.id]);
  useEffect(() => { setSisters(null); setChoice(''); setConfirming(''); void load(); }, [load]);
  const candidates = workspaces.filter(w => w.id !== workspace.id && !(sisters ?? []).some(s => s.workspace_id === w.id));
  async function act(action: () => Promise<unknown>, success: string) { setBusy(true); setError(''); setMessage(''); try { await action(); await load(); setMessage(success); setChoice(''); setConfirming(''); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  if (sisters === null || (!sisters.length && !(canEdit && candidates.length))) return null;
  return <section className="panel company-group"><p className="eyebrow">{t('FIRMENVERBUND')}</p><h2>{t('Schwesterfirmen.')}</h2>
    <p className="muted">{t('Jede Firma ist ein eigener Workspace – mit eigenen Mitgliedern, Rechten, Feiertagen, Währung und Rechnungen. Verknüpfte Firmen können einander Projekte übergeben.')}</p>
    {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
    {sisters.length > 0 && <ul className="group-list">{sisters.map(s => <li key={s.workspace_id}><Building2 size={17} aria-hidden="true"/><div><strong>{s.name}</strong><small className="muted">{s.currency} · {s.timezone}</small></div>
      {s.can_unlink && (confirming === s.workspace_id
        ? <span className="button-row"><button className="button danger small" disabled={busy} onClick={() => void act(() => service.unlinkWorkspaces({ workspace_id: workspace.id, other_workspace_id: s.workspace_id }), t('Verknüpfung getrennt.'))}>{t('Wirklich trennen')}</button><button className="button secondary small" disabled={busy} onClick={() => setConfirming('')}>{t('Abbrechen')}</button></span>
        : <button className="button secondary small" disabled={busy} onClick={() => setConfirming(s.workspace_id)} aria-label={t('Verknüpfung mit {name} trennen', { name: s.name })}><Unlink size={14}/> {t('Trennen')}</button>)}</li>)}</ul>}
    {canEdit && candidates.length > 0 && <div className="group-link"><div className="field"><span>{t('Firma verknüpfen')}</span><SelectMenu label={t('Firma verknüpfen')} disabled={busy} value={choice} onChange={setChoice} options={[{ value: '', label: t('Workspace wählen …') }, ...candidates.map(w => ({ value: w.id, label: w.name, sublabel: w.currency }))]}/><small className="muted">{t('Zur Wahl stehen deine anderen Workspaces. Du brauchst in beiden das Recht, Einstellungen zu bearbeiten.')}</small></div>
      <button className="button primary small" disabled={busy || !choice} onClick={() => void act(() => service.linkWorkspaces({ workspace_id: workspace.id, other_workspace_id: choice }), t('Firmen verknüpft.'))}><Link2 size={15}/> {t('Verknüpfen')}</button></div>}
  </section>;
}

function SummaryList({ h }: { h: ProjectHandover }) {
  const { t } = useI18n(); const s = h.summary;
  return <dl className="handover-facts">
    {s.budget_minutes !== undefined && s.booked_minutes !== undefined && <div><dt>{t('Restbudget')}</dt><dd>{s.budget_minutes ? minutesLabel(Math.max(0, s.budget_minutes - s.booked_minutes)) : t('Ohne Zeitbudget')}</dd></div>}
    <div><dt>{t('Phasen')}</dt><dd>{s.phases}</dd></div>
    {s.open_tasks !== undefined && <div><dt>{t('Offene Aufgaben')}</dt><dd>{s.open_tasks}</dd></div>}
    {s.planned_minutes !== undefined && <div><dt>{t('Geplant ab jetzt')}</dt><dd>{minutesLabel(s.planned_minutes)}</dd></div>}
    {s.due_date && <div><dt>{t('Termin')}</dt><dd>{shortDate(s.due_date)}</dd></div>}
  </dl>;
}

/**
 * Projekte: eingehende und ausgehende Übergaben, dazu der Dialog „An Schwesterfirma übergeben“.
 * `children` bekommt die Funktion, die den Dialog für ein Projekt öffnet – oder `undefined`, wenn es
 * keine Schwesterfirma gibt oder das Recht fehlt.
 */
export function HandoverSection({ workspace, service, rights, projects, reload, children }: { workspace: Workspace; service: Service; rights: Rights; projects: Project[]; reload: () => Promise<unknown> | void; children: (offer: ((project: Project) => void) | undefined) => ReactNode }) {
  const { t } = useI18n();
  const [sisters, setSisters] = useState<SisterWorkspace[]>([]); const [handovers, setHandovers] = useState<ProjectHandover[]>([]);
  const [target, setTarget] = useState<{ project: Project; sisterId?: string } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    // Fehlen die Tabellen noch (Migration nicht eingespielt), bleibt der Bereich einfach leer.
    const list = await service.listSisters(workspace.id).catch(() => [] as SisterWorkspace[]);
    setSisters(list);
    setHandovers(list.length ? await service.listHandovers(workspace.id).catch(() => [] as ProjectHandover[]) : []);
  }, [service, workspace.id]);
  useEffect(() => { setSisters([]); setHandovers([]); setTarget(null); setError(''); setMessage(''); void load(); }, [load]);
  async function act(action: () => Promise<unknown>, success: string, reloadProjects = false) { setBusy(true); setError(''); setMessage(''); try { await action(); setTarget(null); await load(); if (reloadProjects) await reload(); setMessage(success); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); } }
  const offer = useCallback((project: Project, sisterId?: string) => { setError(''); setMessage(''); setTarget({ project, sisterId }); }, []);
  const incoming = handovers.filter(h => h.status === 'offered' && h.target_workspace_id === workspace.id);
  const outgoing = handovers.filter(h => h.status === 'offered' && h.source_workspace_id === workspace.id);
  const canEdit = can(rights, 'projects', 'edit');
  const canTransfer = canEdit && can(rights, 'tasks', 'edit') && can(rights, 'planning', 'edit') && can(rights, 'time_team');
  return <>
    {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
    {(incoming.length > 0 || outgoing.length > 0) && <section className="panel handover-panel" aria-label={t('Projektübergaben')}><p className="eyebrow">{t('FIRMENVERBUND')}</p><h2>{t('Projektübergaben.')}</h2>
      <ul className="handover-list">
        {incoming.map(h => <li key={h.id} className="handover-item handover-incoming"><div className="handover-head"><ArrowRightLeft size={17} aria-hidden="true"/><div><strong>{h.summary.code} · {h.summary.name}</strong><small className="muted">{t('{firm} bietet dieses Projekt an', { firm: h.summary.source_name })}{h.summary.offered_by_name ? ` · ${h.summary.offered_by_name}` : ''} · {shortDate(h.offered_at.slice(0, 10))}{h.summary.client ? ` · ${h.summary.client}` : ''}</small></div></div>
          {h.note && <p className="handover-note">{h.note}</p>}<SummaryList h={h}/>
          {canEdit && <div className="button-row">
            {canTransfer && <button className="button primary small" disabled={busy} onClick={() => void act(() => service.acceptHandover(h.id), t('Projekt übernommen.'), true)}><Check size={15}/> {t('Übernehmen')}</button>}
            <button className="button secondary small" disabled={busy} onClick={() => void act(() => service.declineHandover(h.id), t('Angebot abgelehnt.'))}><X size={15}/> {t('Ablehnen')}</button>
          </div>}
          {!canTransfer && <small className="muted">{t('Zum Annehmen brauchst du Bearbeitungsrechte für Projekte, Aufgaben und Kapazität sowie Leserechte für Teamzeiten.')}</small>}</li>)}
        {outgoing.map(h => <li key={h.id} className="handover-item"><div className="handover-head"><ArrowRightLeft size={17} aria-hidden="true"/><div><strong>{h.summary.code} · {h.summary.name}</strong><small className="muted">{t('Angeboten an {firm}', { firm: h.summary.target_name })} · {shortDate(h.offered_at.slice(0, 10))}</small></div></div>
          {canEdit && <div className="button-row"><button className="button secondary small" disabled={busy} onClick={() => void act(() => service.withdrawHandover(h.id), t('Angebot zurückgezogen.'))}><Undo2 size={15}/> {t('Zurückziehen')}</button></div>}</li>)}
      </ul></section>}
    {sisters.length > 0 && <section className="panel company-map-panel"><div className="panel-heading"><div><p className="eyebrow">{t('FIRMENVERBUND')}</p><h2>{t('Firmenkarte.')}</h2><p className="muted">{canTransfer ? t('Zieh ein Projekt auf eine Schwesterfirma, um es zu übergeben.') : t('Eure Firmen und was zwischen ihnen unterwegs ist.')}</p></div></div>
      <Suspense fallback={<div className="company-map company-map-loading" aria-hidden="true"/>}><CompanyMap workspace={workspace} sisters={sisters} projects={projects} handovers={handovers} canOffer={canTransfer} onOffer={offer}/></Suspense></section>}
    {children(canTransfer && sisters.length ? (project => offer(project)) : undefined)}
    {target && <OfferDialog key={`${target.project.id}-${target.sisterId ?? ''}`} project={target.project} sisters={sisters} initialSister={target.sisterId} pending={outgoing.some(h => h.source_project_id === target.project.id)} busy={busy} onClose={() => setTarget(null)}
      onOffer={(sister, note, takeNow) => act(async () => { const h = await service.offerHandover({ project_id: target.project.id, target_workspace_id: sister.workspace_id, note }); if (takeNow) await service.acceptHandover(h.id); }, takeNow ? t('Projekt übergeben.') : t('Angebot gesendet.'), takeNow)}/>}
  </>;
}

function OfferDialog({ project, sisters, initialSister, pending, busy, onClose, onOffer }: { project: Project; sisters: SisterWorkspace[]; initialSister?: string; pending: boolean; busy: boolean; onClose: () => void; onOffer: (sister: SisterWorkspace, note: string, takeNow: boolean) => Promise<boolean> }) {
  const { t } = useI18n();
  const [sisterId, setSisterId] = useState(initialSister && sisters.some(s => s.workspace_id === initialSister) ? initialSister : sisters[0]?.workspace_id ?? ''); const [note, setNote] = useState(''); const [takeNow, setTakeNow] = useState(false);
  const sister = sisters.find(s => s.workspace_id === sisterId);
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (sister) void onOffer(sister, note.trim(), takeNow && sister.can_accept); }
  return <Dialog title="Projekt an Schwesterfirma übergeben" description={`${project.code} · ${project.name}`} onClose={onClose} busy={busy}>
    <form className="form-stack" onSubmit={submit}>
      {pending && <Notice kind="info">{t('Für dieses Projekt liegt schon ein offenes Angebot vor.')}</Notice>}
      <div className="field"><span>{t('Zielfirma')}</span><SelectMenu label={t('Zielfirma')} disabled={busy} value={sisterId} onChange={setSisterId} options={sisters.map(s => ({ value: s.workspace_id, label: s.name, sublabel: s.currency }))}/></div>
      <Field label="Notiz an die Zielfirma" hint="Optional: Stand, Ansprechperson, was als Nächstes ansteht."><textarea value={note} maxLength={1000} rows={3} onChange={e => setNote(e.target.value)}/></Field>
      <div className="handover-explain"><p><strong>{t('Das wandert mit:')}</strong> {t('laufende und künftige Phasen, offene Aufgaben, der Kapazitätsplan ab dieser Woche und das Restbudget.')}</p><p><strong>{t('Das bleibt hier:')}</strong> {t('gebuchte Zeiten, Rechnungen, Angebote, Ausgaben und die Finanzplanung. Das Projekt wird hier archiviert, sobald die Zielfirma annimmt.')}</p></div>
      {sister?.can_accept && <label className="checkbox-field"><input type="checkbox" checked={takeNow} onChange={e => setTakeNow(e.target.checked)}/><span>{t('Sofort an {firm} übergeben', { firm: sister.name })}</span></label>}
      <FormActions busy={busy} onClose={onClose} label={takeNow && sister?.can_accept ? 'Jetzt übergeben' : 'Angebot senden'}/>
    </form>
  </Dialog>;
}
