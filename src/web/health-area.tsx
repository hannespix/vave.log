import { useEffect, useState } from 'react';
import { ArrowUpRight, Flame } from 'lucide-react';
import type { Membership, Project, Task, Workspace } from '../shared/types';
import type { Service } from '../shared/service';
import { capacityPlan, loadPercent } from '../shared/capacity';
import { portfolioHealth, type HealthSignal, type ProjectHealth } from '../shared/project-health';
import { useI18n } from './i18n';
import { longDate, minutesLabel, readableTextOn } from './helpers';
import type { WorkflowTarget } from './workflow-navigation';
import { emptyTaskFilters } from './workflow-navigation';
import './health.css';

interface Props { projects: Project[]; tasks: Task[]; members: Membership[]; workspace: Workspace; userId: string; allProjects: boolean; service: Service; today: string; reloadKey: unknown; onNavigate: (target: WorkflowTarget) => void; onInsight: (id: string) => void }

/** Lagebild: Ampel je aktivem Projekt mit Gründen und Sofort-Aktionen. Mitglieder sehen nur Projekte mit eigenen Aufgaben, ohne Budgetsignale. */
export function HealthBoard({ projects, tasks, members, workspace, userId, allProjects, service, today, reloadKey, onNavigate, onInsight }: Props) {
  const { t } = useI18n();
  const [effort, setEffort] = useState<Map<string, { minutes: number; last_work_date: string | null }> | null>(null);
  const [taskEffort, setTaskEffort] = useState<Map<string, number>>(new Map());
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => Promise.all([service.listProjectEffort(workspace.id), service.listTaskEffort(workspace.id)]))
      .then(([rows, tasksRows]) => { if (alive) { setEffort(new Map(rows.map((r) => [r.project_id, { minutes: r.minutes, last_work_date: r.last_work_date }]))); setTaskEffort(new Map(tasksRows.map((r) => [r.task_id, r.minutes]))); } })
      .catch(() => { if (alive) setEffort(new Map()); });
    return () => { alive = false; };
  }, [service, workspace.id, reloadKey]);
  const scope = allProjects ? projects : projects.filter((p) => tasks.some((task) => task.project_id === p.id && task.assignee_id === userId));
  // Überlastete Personen dieser Woche (Cockpit-Rechnung ohne Abwesenheiten – die Zelle genügt als Warnsignal).
  const plan = capacityPlan({ members: members.filter((m) => !m.is_demo), tasks, effort: taskEffort, absences: [], today, weeks: 1, defaultLocation: workspace.default_location ?? null });
  const overloaded = new Set(plan.rows.filter((r) => { const p = loadPercent(r.cells[0]); return p != null && p > 100; }).map((r) => r.user_id));
  const list = portfolioHealth(scope, tasks, effort ?? new Map(), { today, overloadedUsers: overloaded, includeBudget: allProjects });
  const hot = list.filter((h) => h.level !== 'green');
  const shown = showAll ? list : hot;
  const name = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.display_name || m?.email || t('Teammitglied'); };
  if (!list.length) return null;
  const reason = (s: HealthSignal): string => {
    switch (s.kind) {
      case 'project-overdue': return t('Projekttermin {date} überschritten', { date: longDate(s.detail ?? '') });
      case 'deadline-near': return t('Termin {date} in Kürze, Fortschritt unter 70 %', { date: longDate(s.detail ?? '') });
      case 'milestone-overdue': return t('{count} Meilensteine überfällig, z. B. „{name}“', { count: s.value, name: s.detail ?? '' });
      case 'tasks-overdue': return t('{count} Aufgaben überfällig, z. B. „{name}“', { count: s.value, name: s.detail ?? '' });
      case 'budget-over': return t('Zeitbudget zu {percent} % verbraucht', { percent: s.value });
      case 'budget-ahead': return t('Budget zu {percent} % verbraucht bei {progress} % Fortschritt', { percent: s.value, progress: s.detail ?? '0' });
      case 'stale': return t('Keine gebuchte Zeit seit {date}', { date: longDate(s.detail ?? '') });
      case 'unassigned-soon': return t('{count} Aufgaben mit nahem Termin ohne Zuständige', { count: s.value });
      case 'unestimated': return t('{count} offene Aufgaben ohne Schätzung', { count: s.value });
      case 'overloaded': return t('{count} Zuständige diese Woche über 100 % ausgelastet', { count: s.value });
    }
  };
  const levelLabel = { red: t('Brennt'), yellow: t('Wackelt'), green: t('Läuft') } as const;
  const summary = { red: list.filter((h) => h.level === 'red').length, yellow: list.filter((h) => h.level === 'yellow').length, green: list.filter((h) => h.level === 'green').length };
  return <section className="panel health-board" aria-labelledby="health-heading"><div className="panel-heading"><div><p className="eyebrow">{t('LAGEBILD')}</p><h2 id="health-heading">{hot.length ? t('Wo es brennt.') : t('Alles im Fluss.')}</h2><p className="health-summary"><span className="health-pill red">{summary.red} {t('brennt')}</span><span className="health-pill yellow">{summary.yellow} {t('wackelt')}</span><span className="health-pill green">{summary.green} {t('läuft')}</span></p></div>{list.length > hot.length && <button className="text-button tiny" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>{showAll ? t('Nur Auffälliges') : t('Alle {count} Projekte', { count: list.length })}</button>}</div>
    {shown.length === 0 ? <p className="muted">{t('Kein Projekt braucht gerade Aufmerksamkeit. Termine, Budgets und Zuständigkeiten sind im Rahmen.')}</p> : <div className="health-grid">{shown.map((h: ProjectHealth) => { const p = projects.find((x) => x.id === h.project_id)!; const people = [...new Set(tasks.filter((task) => task.project_id === p.id && task.status !== 'done' && task.assignee_id).map((task) => task.assignee_id!))]; return <article className={`health-card health-${h.level}`} key={h.project_id}><div className="health-card-top"><span className="project-mark" style={{ backgroundColor: p.color, color: readableTextOn(p.color) }} aria-hidden="true">{p.code.slice(0, 2)}</span><div><button className="project-text-link" onClick={() => onNavigate({ view: 'projects', projectId: p.id })}><strong>{p.name}</strong><ArrowUpRight size={12}/></button><small className="muted">{p.client || p.code}{p.due_date && ` · ${t('bis {date}', { date: longDate(p.due_date) })}`}</small></div><span className={`health-badge health-${h.level}`}>{h.level === 'red' && <Flame size={12}/>}{levelLabel[h.level]}</span></div>
      {h.signals.length > 0 ? <ul className="health-reasons">{h.signals.map((s, i) => <li key={i}>{reason(s)}</li>)}</ul> : <p className="muted health-ok">{t('Keine Auffälligkeiten.')}</p>}
      <div className="health-facts"><span>{t('{count} offen', { count: h.openTasks })}</span>{h.progressPercent != null && <span>{t('{percent} % fertig', { percent: h.progressPercent })}</span>}{allProjects && p.budget_minutes > 0 && <span>{minutesLabel(h.bookedMinutes)} / {minutesLabel(p.budget_minutes)}</span>}{people.length > 0 && <span>{people.slice(0, 3).map(name).join(', ')}{people.length > 3 && ` +${people.length - 3}`}</span>}</div>
      <div className="health-actions"><button className="text-button tiny" onClick={() => onNavigate({ view: 'tasks', projectId: p.id, taskFilters: { ...emptyTaskFilters(), quick: h.overdueTasks ? 'overdue' : 'all' } })}>{h.overdueTasks ? t('Überfällige Aufgaben') : t('Aufgaben')}<ArrowUpRight size={11}/></button>{allProjects && <button className="text-button tiny" onClick={() => onNavigate({ view: 'planning', projectId: '' })}>{t('Umplanen')}<ArrowUpRight size={11}/></button>}{allProjects && <button className="text-button tiny" onClick={() => onInsight(p.id)}>{t('Prognose')}<ArrowUpRight size={11}/></button>}</div>
    </article>; })}</div>}
    <p className="tiny muted">{t('Die Ampel summiert erklärbare Signale: Termine, Meilensteine, überfällige Aufgaben, Budgetverbrauch gegen Fortschritt, liegengebliebene Arbeit, fehlende Zuständigkeiten und Schätzungen, überlastete Personen. Ab 3 Punkten gelb, ab 6 rot.')}</p>
  </section>;
}
