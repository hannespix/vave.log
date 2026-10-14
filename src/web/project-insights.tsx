import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, Flag, Pencil, RefreshCw } from 'lucide-react';
import type { Service } from '../shared/service';
import type { Project } from '../shared/types';
import type { TaskFilters } from './workflow-navigation';
import type { ProjectInsight } from '../shared/project-insight-types';
import { forecastProject } from '../shared/project-forecast';
import { Dialog, Notice, Spinner } from './components';
import { localeTag, useI18n } from './i18n';
import { formatInsightDate, formatInsightHours, insightText } from './project-insight-copy';
import './project-insights.css';

export type ProjectInsightDestination = 'tasks' | 'time' | 'reports' | 'planning' | 'invoices';
type Actions = { onEdit: (project: Project) => void; onNavigate: (destination: ProjectInsightDestination, filters?: Partial<TaskFilters>) => void };
type Props = Actions & { service: Service; workspaceId: string; projectId: string; onClose: () => void };
type LoadState = {service: Service;workspaceId:string;projectId:string;attempt:number} & ({status:'loaded';insight:ProjectInsight} | {status:'error'});

export function ProjectInsightDialog({service,workspaceId,projectId,onClose,onEdit,onNavigate}: Props) {
 const {locale} = useI18n();
 const [attempt,setAttempt] = useState(0);
 const [state,setState] = useState<LoadState | null>(null);
 useEffect(() => {
  const refresh = () => { if(document.visibilityState === 'visible') setAttempt(value => value + 1); };
  window.addEventListener('focus',refresh);
  return () => window.removeEventListener('focus',refresh);
 }, []);
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
  {!scoped ? <Spinner label={insightText(locale,'loading')}/> : scoped.status === 'error' ? <div className="project-insight-error"><Notice>{insightText(locale,'loadError')}</Notice><button className="button secondary small" type="button" onClick={() => setAttempt(value => value + 1)}>{insightText(locale,'retry')}</button></div> : <><div className="project-insight-toolbar"><button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={13}/>{insightText(locale,'refresh')}</button></div><ProjectInsightSummary insight={scoped.insight} onEdit={onEdit} onNavigate={onNavigate}/></>}
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
 const progress = model.progress;
 const percent = progress.percent === null ? '—' : new Intl.NumberFormat(localeTag(locale),{style:'percent',maximumFractionDigits:1}).format(progress.percent / 100);
 const milestones = insight.milestones;
 const missing: {label:string;action:()=>void}[] = [];
 if (!progress.total) missing.push({label:c('addTasks'),action:()=>onNavigate('tasks')});
 if(progress.missingEstimates) missing.push({label:c('missingEstimates',{count:progress.missingEstimates}),action:()=>onNavigate('tasks')});
 if(progress.missingDueDates) missing.push({label:c('missingDates',{count:progress.missingDueDates}),action:()=>onNavigate('tasks',{due:'none'})});
 if(progress.unassigned) missing.push({label:c('missingAssignees',{count:progress.unassigned}),action:()=>onNavigate('tasks',{assignee:'unassigned'})});
 if(!model.budgetMinutes) missing.push({label:c('addBudget'),action:()=>onEdit(insight.project)});
 if(!model.deadlineDate) missing.push({label:c('addDeadline'),action:()=>onEdit(insight.project)});
 if(progress.percent!==100&&model.blockers.some(value=>['no-effort','insufficient-history','no-pace','invalid-history'].includes(value))) missing.push({label:c('addHistory'),action:()=>onNavigate('time')});
 const blocker = model.blockers.find(value => !['insufficient-history','no-pace','missing-progress','zero-progress','no-effort'].includes(value));
 return <div className="project-insight">
  <section className="project-progress-hero" aria-label={c('progress')}>
   <div className="project-progress-heading"><span>{c('progress')}</span>{progress.method !== 'none' && <span className="project-progress-method">{c(progress.method==='estimated-effort'?'weighted':'unweighted')}</span>}</div>
   <strong className="project-progress-number">{percent}</strong>
   <p>{progress.percent===null?c('noProgress'):progress.percent===100?c('complete'):c('tasksDone',{total:progress.total,done:progress.done,overdue:insight.tasks.overdue})}</p>
   <div className="project-progress-track" role="progressbar" aria-label={c('progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent??undefined} aria-valuetext={progress.percent===null?c('noProgress'):percent}><span style={{width:`${progress.percent??0}%`}}/></div>
   <dl className="project-task-breakdown">{([['done',progress.done],['doing',progress.doing],['open',Math.max(0,progress.total-progress.done-progress.doing)]] as const).map(([key,value])=><div key={key}><dt>{c(key)}</dt><dd>{value}</dd></div>)}</dl>
  </section>
  <p className="project-insight-scope">{c('scope',{date:date(insight.as_of)})}</p>
  <dl className="project-insight-metrics">
   <InsightMetric label={c('recorded')} value={hours(model.usedMinutes)}><p>{c('budgetConsumption')}</p></InsightMetric>
   <InsightMetric label={c('budget')} value={model.budgetMinutes===null?c('noBudget'):hours(model.budgetMinutes)}><p>{budgetCopy}</p><p>{effortCopy}</p>{model.projectedTotalMinutes!==null&&<p>{c('effort')}: {hours(model.projectedTotalMinutes)}</p>}</InsightMetric>
   <InsightMetric label={c('eta')} value={model.predictedFinishDate?date(model.predictedFinishDate):'—'}><p>{model.predictedFinishDate?c('paceValue',{hours:hours(model.paceMinutesPerDay!)}):progress.percent===100?c('completeDate'):model.blockers.length?c(model.blockers[0]):c('unavailable')}</p></InsightMetric>
   <InsightMetric label={c('deadline')} value={model.deadlineDate?date(model.deadlineDate):c('noDeadline')}><p>{deadlineCopy}</p></InsightMetric>
  </dl>
  {blocker && model.progressState !== 'complete' && <Notice kind="info">{c(blocker)}</Notice>}
  <section className="project-milestones" aria-label={c('milestones')}>
   <div className="project-insight-section-heading"><h3><Flag size={14}/>{c('milestones')}</h3><span>{milestones?.total?c('milestoneCount',{total:milestones.total,done:milestones.done}):c('noMilestones')}</span></div>
   {milestones?.items.length?<ol>{milestones.items.map(item=><li key={item.id} className={item.status==='done'?'is-complete':''}><span className="milestone-dot" aria-hidden="true">{item.status==='done'?<Check size={11}/>:null}</span><button type="button" onClick={()=>onNavigate('tasks',{query:item.title})}><strong>{item.title}</strong><span>{c(item.status==='done'?'done':item.status==='doing'?'doing':'open')} · {item.due_date?date(item.due_date):c('noTaskDate')}{item.status!=='done'&&item.due_date&&item.due_date<insight.as_of&&<em>{c('overdue')}</em>}</span></button><ArrowUpRight size={13} aria-hidden="true"/></li>)}</ol>:<button type="button" className="text-button project-milestone-empty" onClick={()=>onNavigate('tasks')}>{c('milestoneHint')}<ArrowUpRight size={13}/></button>}
   {milestones && milestones.total>milestones.items.length&&<button type="button" className="text-button tiny" onClick={()=>onNavigate('tasks')}>{c('milestoneMore',{shown:milestones.items.length,total:milestones.total})}<ArrowUpRight size={13}/></button>}
  </section>
  <details className="project-insight-assumptions project-insight-missing"><summary>{c('missingData')}<span className="project-data-count">{missing.length}</span></summary>{missing.length?<><p>{c('dataHint')}</p><ul>{missing.map((item,index)=><li key={index}><button className="text-button" type="button" onClick={item.action}>{item.label}<ArrowUpRight size={13}/></button></li>)}</ul></>:<p>{c('dataReady')}</p>}</details>
  <details className="project-insight-assumptions"><summary>{c('assumptions')}</summary><p>{c('progressAssumption')}</p><p>{c('taskAssumption')}</p><p>{c('calculation')}</p><p>{model.projectedTotalMinutes===null?c('unavailable'):c('effort')+': '+hours(model.projectedTotalMinutes)+' · '+effortCopy}</p><p>{c('pace')}: {model.paceMinutesPerDay===null?'—':c('paceValue',{hours:hours(model.paceMinutesPerDay)})} · {c('observed',{days:model.observationDays,logged:model.loggedDays})}</p><p>{c('paceAssumption')}</p><p>{c('scheduleAssumption')}</p></details>
  <div className="project-insight-actions"><button className="text-button" type="button" onClick={() => onEdit(insight.project)}><Pencil size={14}/>{c('edit')}</button><nav className="project-insight-links" aria-label={c('related')}>{(['tasks','time','reports','planning','invoices'] as const).map(destination => <button className="text-button" type="button" key={destination} onClick={() => onNavigate(destination)}>{c(destination)}<ArrowUpRight size={13}/></button>)}</nav></div>
 </div>;
}
