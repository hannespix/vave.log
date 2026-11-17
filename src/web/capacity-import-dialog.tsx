import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { Membership, Project, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { buildPlanImport, parseCapacityGrid, PlanParseError, suggestPeople, suggestProjects, type ParsedPlan } from '../shared/capacity-import';
import { gridFromText, readXlsx, XlsxError, type Sheet } from '../shared/xlsx-read';
import { Dialog, Notice } from './components';
import { useI18n } from './i18n';
import { errorMessage, shortDate } from './helpers';
import { SelectMenu, memberOption, projectOption } from './select-menu';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
interface Props { members: Membership[]; projects: Project[]; workspace: Workspace; service: Service; run: Run; busy: boolean; canProjects: boolean; hasPlan: boolean; today: string; onClose: () => void }
const NEW = '__new__', SKIP = 'skip', OPEN = '';
const peopleKey = (workspaceId: string) => `vave-log.plan-people.${workspaceId}`;
/** Gemerkte Zuordnung Kürzel → Person: Beim nächsten Import ist sie wieder da. Nur Kennungen, keine Namen. */
function remembered(workspaceId: string): Record<string, string> { try { const v = JSON.parse(localStorage.getItem(peopleKey(workspaceId)) ?? '{}'); return v && typeof v === 'object' ? v as Record<string, string> : {}; } catch { return {}; } }

/** Kapazitätsplan aus Excel: Datei wählen oder Zellen einfügen, Zuordnung prüfen, in einem Schritt übernehmen. */
export function PlanImportDialog({ members, projects, workspace, service, run, busy, canProjects, hasPlan, today, onClose }: Props) {
  const { t, locale } = useI18n();
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(true);
  const [pasted, setPasted] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const year = Number(today.slice(0, 4));

  const accept = (parsed: ParsedPlan, name: string) => {
    const known = remembered(workspace.id), guess = suggestPeople(parsed.persons, members.map((m) => ({ user_id: m.user_id, display_name: m.display_name, email: m.email })));
    setPeople(Object.fromEntries(parsed.persons.map((p) => { const saved = known[p]; return [p, saved && members.some((m) => m.user_id === saved) ? saved : guess[p] ?? OPEN]; })));
    const match = suggestProjects(parsed.projects.map((p) => p.name), projects.filter((p) => p.status !== 'archived'));
    setTargets(Object.fromEntries(parsed.projects.map((p) => [p.name, match[p.name] ?? (canProjects ? NEW : SKIP)])));
    setPlan(parsed); setSource(name); setError('');
  };
  const fail = (e: unknown) => { setPlan(null); setError(e instanceof PlanParseError || e instanceof XlsxError ? t(e.message) : errorMessage(e)); };
  const fromSheets = (sheets: Sheet[], name: string) => {
    let first: unknown = null;
    for (const sheet of sheets) { try { accept(parseCapacityGrid(sheet.rows, { merges: sheet.merges, year }), sheets.length > 1 ? `${name} · ${sheet.name}` : name); return; } catch (e) { first ??= e; } }
    fail(first);
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return; setReading(true); setError('');
    try {
      if (/\.(csv|tsv|txt)$/i.test(file.name)) { const text = await file.text(); accept(parseCapacityGrid(gridFromText(text.includes('\t') ? text : text.replace(/;/g, '\t')), { year }), file.name); }
      else fromSheets(await readXlsx(await file.arrayBuffer()), file.name);
    } catch (e) { fail(e); } finally { setReading(false); if (input.current) input.current.value = ''; }
  };
  const readPaste = () => { try { accept(parseCapacityGrid(gridFromText(pasted), { year }), t('Eingefügte Tabelle')); } catch (e) { fail(e); } };
  const drop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setOver(false); void readFile(e.dataTransfer.files[0]); };

  const submit = async () => {
    if (!plan) return;
    const mapping = { people: Object.fromEntries(Object.entries(people).map(([code, id]) => [code, id || null])), projects: Object.fromEntries(Object.entries(targets).map(([name, id]) => [name, id === NEW ? null : id])), replace };
    const payload = buildPlanImport(plan, mapping, projects.map((p) => p.code));
    if (!payload.projects.length) { setError(t('Kein Projekt ausgewählt.')); return; }
    try { const keep = { ...remembered(workspace.id) }; for (const [code, id] of Object.entries(people)) { if (id) keep[code] = id; else delete keep[code]; } localStorage.setItem(peopleKey(workspace.id), JSON.stringify(keep)); } catch { /* ohne Speicher wird die Zuordnung nur nicht gemerkt */ }
    const rows = payload.projects.reduce((a, p) => a + p.rows.length, 0);
    const ok = await run(() => service.importPlan(workspace.id, payload), t('Plan übernommen: {rows} Zeilen in {count} Projekten.', { count: payload.projects.length, rows }));
    if (ok) onClose(); else setError(t('Der Plan wurde nicht übernommen. Prüfe den Hinweis im Workspace und versuche es erneut.'));
  };

  const hours = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const rowCount = plan?.projects.reduce((a, p) => a + p.rows.length, 0) ?? 0;
  const chosen = plan?.projects.filter((p) => targets[p.name] !== SKIP) ?? [];
  const unassigned = plan ? plan.persons.filter((p) => !people[p]).length : 0;
  return <Dialog title={t('Kapazitätsplan aus Excel')} onClose={onClose} busy={busy} wide>
    <div className="form-stack plan-import">
      {error && <Notice>{error}</Notice>}
      {!plan && <>
        <p className="muted">{t('Erwartet wird die übliche Matrix: eine Kopfzeile mit Kalenderwochen (KW 23 oder CW 23), links Projekt, Position und Person, darunter je Projekt ein Block. Phasen stehen als Beschriftung über den Wochen. Die Datei wird nur in deinem Browser gelesen.')}</p>
        <div className={over ? 'plan-drop over' : 'plan-drop'} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
          <FileSpreadsheet size={26} aria-hidden="true"/>
          <p><strong>{t('Excel-Datei hierher ziehen')}</strong><br/><span className="muted">{t('.xlsx, .csv oder .tsv, bis 8 MB')}</span></p>
          <button type="button" className="button secondary small" disabled={reading} onClick={() => input.current?.click()}><Upload size={14}/> {reading ? t('Wird gelesen …') : t('Datei wählen')}</button>
          <input ref={input} type="file" hidden accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label={t('Excel-Datei wählen')} onChange={(e: ChangeEvent<HTMLInputElement>) => void readFile(e.target.files?.[0])}/>
        </div>
        <label className="field"><span>{t('Oder Zellen aus Excel kopieren und hier einfügen')}</span><textarea rows={4} value={pasted} placeholder={t('Bereich in Excel markieren, kopieren, hier einfügen')} onChange={(e) => setPasted(e.target.value)}/></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Abbrechen')}</button><button type="button" className="button primary" disabled={!pasted.trim()} onClick={readPaste}>{t('Eingefügte Tabelle lesen')}</button></div>
      </>}
      {plan && <>
        <div className="plan-import-summary"><div><span>{t('Quelle')}</span><strong>{source}</strong></div><div><span>{t('Zeitraum')}</span><strong>{t('KW {week}', { week: plan.weeks[0].week })} – {t('KW {week}', { week: plan.weeks[plan.weeks.length - 1].week })}</strong><small className="muted">{shortDate(plan.weeks[0].start)} – {shortDate(plan.weeks[plan.weeks.length - 1].start)}</small></div><div><span>{t('Projekte')}</span><strong>{plan.projects.length}</strong></div><div><span>{t('Zeilen')}</span><strong>{rowCount}</strong></div><div><span>{t('Stunden')}</span><strong>{hours(plan.hours)}</strong></div></div>
        {plan.warnings.map((w) => <Notice key={w} kind="info">{w.startsWith('Ohne Stunden: ') ? t('Ohne Stunden: {names}', { names: w.slice(14) }) : w}</Notice>)}
        {(plan.team.length > 0 || plan.absencePeople.length > 0) && <p className="tiny muted">{t('Team- und Urlaubsblock der Tabelle werden nicht übernommen: Freie Kapazität rechnet das Tool aus Arbeitszeitmodell, Feiertagen und Abwesenheiten selbst.')}</p>}
        <div className="plan-import-columns">
          <section><h3>{t('Personen zuordnen')}</h3><p className="tiny muted">{unassigned ? t('{count} Kürzel ohne Person bleiben als offene Zeile im Plan – mit dem Kürzel als Notiz.', { count: unassigned }) : t('Alle Kürzel sind einer Person zugeordnet.')}</p>
            <div className="plan-map">{plan.persons.map((code) => <div className="plan-map-row" key={code}><span className="plan-map-key">{code}</span><SelectMenu compact label={t('Person für {code}', { code })} value={people[code] ?? OPEN} onChange={(id) => setPeople((p) => ({ ...p, [code]: id }))} options={[{ value: OPEN, label: t('Offen lassen') }, ...members.map((m) => memberOption(m))]}/></div>)}{!plan.persons.length && <p className="muted">{t('Keine Personen in der Tabelle.')}</p>}</div></section>
          <section><h3>{t('Projekte zuordnen')}</h3><p className="tiny muted">{canProjects ? t('Unbekannte Projekte werden angelegt – mit den angebotenen Stunden als Zeitbudget.') : t('Ohne Projektrecht lassen sich nur vorhandene Projekte füllen.')}</p>
            <div className="plan-map">{plan.projects.map((p) => <div className="plan-map-row" key={p.name}><span className="plan-map-key" title={p.name}>{p.name}<small className="muted">{t('{count} Zeilen · {hours} h', { count: p.rows.length, hours: hours(p.rows.reduce((a, r) => a + r.hours, 0)) })}{p.phases.length > 0 && ` · ${t('{count} Phasen', { count: p.phases.length })}`}</small></span><SelectMenu compact label={t('Ziel für {name}', { name: p.name })} value={targets[p.name] ?? SKIP} onChange={(id) => setTargets((x) => ({ ...x, [p.name]: id }))} options={[...(canProjects ? [{ value: NEW, label: t('Neu anlegen') }] : []), { value: SKIP, label: t('Nicht übernehmen') }, ...projects.filter((x) => x.status !== 'archived').map((x) => projectOption(x))]}/></div>)}</div></section>
        </div>
        {hasPlan && <label className="checkbox-field"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)}/> {t('Bisherigen Plan der übernommenen Projekte ersetzen')}</label>}
        {hasPlan && !replace && <p className="tiny muted">{t('Ohne Ersetzen kommen die Zeilen zusätzlich dazu – ein zweiter Import derselben Tabelle verdoppelt die Stunden.')}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { setPlan(null); setError(''); }}>{t('Andere Datei')}</button><button type="button" className="button primary" disabled={busy || !chosen.length} onClick={() => void submit()}>{busy ? t('Wird übernommen …') : t('{count} Projekte übernehmen', { count: chosen.length })}</button></div>
      </>}
    </div>
  </Dialog>;
}
