import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Pencil } from 'lucide-react';
import type { Service } from '../shared/service';
import type { Project } from '../shared/types';
import type { ProjectInsight } from '../shared/project-insight-types';
import { forecastProject } from '../shared/project-forecast';
import { Dialog, Notice, Spinner } from './components';
import { localeTag, useI18n } from './i18n';
import { formatInsightDate, formatInsightHours, insightText } from './project-insight-copy';
import './project-insights.css';

export type ProjectInsightDestination = 'tasks' | 'time' | 'reports' | 'planning' | 'invoices';
type Actions = { onEdit: (project: Project) => void; onNavigate: (destination: ProjectInsightDestination) => void };
type Props = Actions & { service: Service; workspaceId: string; projectId: string; onClose: () => void };
type LoadState = {service: Service;workspaceId:string;projectId:string;attempt:number} & ({status:'loaded';insight:ProjectInsight} | {status:'error'});

export function ProjectInsightDialog({service,workspaceId,projectId,onClose,onEdit,onNavigate}: Props) {
 const {locale} = useI18n();
 const [attempt,setAttempt] = useState(0);
 const [state,setState] = useState<LoadState | null>(null);
 useEffect(() => {
  let current = true;
  setState(null);
  void service.getProjectInsight(workspaceId,projectId).then(insight => {
   if (!current) return;
   // Fail closed if an unexpected response does not match the requested scope.
   if (insight.project.id !== projectId || insight.project.workspace_id !== workspaceId) throw new Error('scope mismatch');
   setState({status:'loaded',service,workspaceId,projectId,attempt,insight});
  }).catch(() => {
   if (current) setState({status:'error',service,workspaceId,projectId,attempt});
  });
  return () => { current = false; };
 }, [service,workspaceId,projectId,attempt]);
 // This render guard removes old aggregates immediately, before effect cleanup.
 const scoped = state?.service === service && state.workspaceId === workspaceId && state.projectId === projectId && state.attempt === attempt ? state : null;
 return <Dialog title={insightText(locale,'title')} onClose={onClose} description={scoped?.status === 'loaded' ? scoped.insight.project.name : undefined}>
  {!scoped ? <Spinner label={insightText(locale,'loading')}/> : scoped.status === 'error' ? <div className="project-insight-error"><Notice>{insightText(locale,'loadError')}</Notice><button className="button secondary small" type="button" onClick={() => setAttempt(value => value + 1)}>{insightText(locale,'retry')}</button></div> : <ProjectInsightSummary insight={scoped.insight} onEdit={onEdit} onNavigate={onNavigate}/>}
 </Dialog>;
}

function InsightMetric({label,value,children}: {label:string;value:string;children?:ReactNode}) {
 return <div className="project-insight-metric"><dt>{label}</dt><dd>{value}</dd><div>{children}</div></div>;
}

export function ProjectInsightSummary({insight,onEdit,onNavigate}: {insight:ProjectInsight} & Actions) {
 const {locale} = useI18n();
 const c = (key: Parameters<typeof insightText>[1], values?: Record<string,string | number>) => insightText(locale,key,values);
 const hours = (minutes:number) => formatInsightHours(minutes,locale);
 const date = (value:string | null | undefined) => formatInsightDate(value,locale);
 const model = forecastProject(insight);
 const budgetCopy = model.budgetRemainingMinutes === null ? c('noBudget') : model.budgetRemainingMinutes < 0 ? c('budgetOver',{hours:hours(-model.budgetRemainingMinutes)}) : c('budgetLeft',{hours:hours(model.budgetRemainingMinutes)});
 const deadlineCopy = model.deadlineStatus === 'complete' ? c('completeDate') : model.deadlineStatus === 'overdue' ? c('deadlineOverdue') : model.deadlineStatus === 'within' ? c('deadlineWithin') : model.deadlineStatus === 'late' ? c('deadlineLate') : c('deadlineUnknown');
 const effortCopy = model.budgetStatus === 'none' ? c('noBudget') : model.budgetStatus === 'within' ? c('effortWithin') : model.budgetStatus === 'over' ? c('effortOver') : c('effortUnknown');
 const blocker = model.blockers.find(value => value !== 'insufficient-history' && value !== 'no-pace') ?? model.blockers[0];
 return <div className="project-insight">
  <p className="project-insight-scope">{c('scope',{date:date(insight.as_of)})}</p>
  <dl className="project-insight-metrics">
   <InsightMetric label={c('recorded')} value={hours(model.usedMinutes)}><p>{budgetCopy}</p></InsightMetric>
   <InsightMetric label={c('progress')} value={model.progressPercent === null ? c('noProgress') : new Intl.NumberFormat(localeTag(locale),{style:'percent',maximumFractionDigits:1}).format(model.progressPercent / 100)}><p>{model.progressState === 'complete' ? c('complete') : insight.progress_date ? c('progressDate',{date:date(insight.progress_date)}) : c('noProgressDate')}</p></InsightMetric>
   <InsightMetric label={c('effort')} value={model.projectedTotalMinutes === null ? '—' : hours(model.projectedTotalMinutes)}><p>{model.remainingMinutes === null ? c('unavailable') : c('remaining',{hours:hours(model.remainingMinutes)})}</p><p>{effortCopy}</p></InsightMetric>
   <InsightMetric label={c('deadline')} value={model.deadlineDate ? date(model.deadlineDate) : insight.project.due_date ? '—' : c('noDeadline')}><p>{model.predictedFinishDate ? c('finish',{date:date(model.predictedFinishDate)}) : deadlineCopy}</p>{model.predictedFinishDate && <p>{deadlineCopy}</p>}</InsightMetric>
  </dl>
  {blocker && model.progressState !== 'complete' && <Notice kind="info">{c(blocker)}</Notice>}
  <div className="project-insight-pace"><div><span>{c('pace')}</span><strong>{model.paceMinutesPerDay === null ? '—' : c('paceValue',{hours:hours(model.paceMinutesPerDay)})}</strong></div><small>{c('observed',{days:model.observationDays,logged:model.loggedDays})}</small></div>
  <button className="text-button project-insight-edit" type="button" onClick={() => onEdit(insight.project)}><Pencil size={14}/>{c('edit')}</button>
  <nav className="project-insight-links" aria-label={c('related')}>{(['tasks','time','reports','planning','invoices'] as const).map(destination => <button className="text-button" type="button" key={destination} onClick={() => onNavigate(destination)}>{c(destination)}<ArrowUpRight size={13}/></button>)}</nav>
  <p className="project-insight-tasks">{c('tasksDone',insight.tasks)}</p>
  <details className="project-insight-assumptions"><summary>{c('assumptions')}</summary><p>{c('calculation')}</p><p>{c('paceAssumption')}</p><p>{c('progressAssumption')}</p><p>{c('scheduleAssumption')}</p><p>{c('taskAssumption')}</p></details>
 </div>;
}
