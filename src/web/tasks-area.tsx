import {useState} from 'react';
import {ArrowUpRight,CalendarDays,Flag,MoreHorizontal,Search,SlidersHorizontal,X} from 'lucide-react';
import type {Membership,Project,Task} from '../shared/types';
import {insightText,formatInsightHours} from './project-insight-copy';
import {Empty} from './components';
import {useI18n} from './i18n';
import {dateInZone,initials,shortDate,statusNames} from './helpers';
import {emptyTaskFilters,filterTasks,type TaskFilters} from './workflow-navigation';
import {SelectMenu,memberOption,memberTabs,projectOption,projectTabs} from './select-menu';
import {wt} from './workflow-copy';

interface Props {
 projects:Project[];tasks:Task[];members:Membership[];userId:string;timezone:string;
 projectId:string;filters:TaskFilters;busy:boolean;
 onProject:(id:string)=>void;onFilters:(filters:TaskFilters,replace?:boolean)=>void;
 onOpenProject:(id:string)=>void;onEdit:(task:Task)=>void;onMove:(task:Task,status:Task['status'])=>void;
}
export function TasksArea({projects,tasks,members,userId,timezone,projectId,filters,busy,onProject,onFilters,onOpenProject,onEdit,onMove}:Props){
 const {t,locale}=useI18n(),w=(key:Parameters<typeof wt>[1],values?:Record<string,string|number>)=>wt(locale,key,values);
 const advancedCount=Number(filters.assignee!=='')+Number(filters.status!=='all')+Number(filters.due!=='all');
 const [advanced,setAdvanced]=useState(advancedCount>0),today=dateInZone(timezone);
 const list=filterTasks(tasks,projects,projectId,filters,userId,today);
 const update=(patch:Partial<TaskFilters>,replace=false)=>onFilters({...filters,...patch},replace);
 const reset=()=>{onFilters(emptyTaskFilters());};
 const chosenProject=projects.find(p=>p.id===projectId);
 const chips:{label:string;clear:()=>void}[]=[];
 if(filters.query)chips.push({label:filters.query,clear:()=>update({query:''})});
 if(filters.quick!=='all')chips.push({label:w(filters.quick),clear:()=>update({quick:'all'})});
 if(filters.status!=='all')chips.push({label:t(statusNames[filters.status]),clear:()=>update({status:'all'})});
 if(filters.assignee)chips.push({label:filters.assignee==='unassigned'?w('unassigned'):members.find(m=>m.user_id===filters.assignee)?.display_name||members.find(m=>m.user_id===filters.assignee)?.email||w('filterUnavailable'),clear:()=>update({assignee:''})});
 if(filters.due!=='all')chips.push({label:w(filters.due==='none'?'noDate':filters.due),clear:()=>update({due:'all'})});
 return <>
  <section className="task-filters" aria-label={w('filters')}>
   <div className="task-filter-primary">
    <label className="workflow-search"><Search size={17} aria-hidden="true"/><span className="sr-only">{w('search')}</span><input type="search" maxLength={240} value={filters.query} onChange={e=>update({query:e.target.value},true)} placeholder={w('searchHint')}/></label>
    <label className="workflow-project-field"><span>{w('project')}</span><SelectMenu compact label={w('project')} value={projectId} onChange={onProject} options={[{value:'',label:w('allProjects')},...(projectId&&!chosenProject?[{value:projectId,label:w('unavailable')}]:[]),...projects.map(p=>projectOption(p))]} tabs={projectTabs(projects,t)}/></label>
    <button className={`button secondary small ${advancedCount?'has-filters':''}`} aria-expanded={advanced} aria-controls="task-advanced-filters" onClick={()=>setAdvanced(!advanced)}><SlidersHorizontal size={16}/>{w(advanced?'hideFilters':'filters')}{advancedCount>0&&<span className="filter-count">{advancedCount}</span>}</button>
   </div>
   <div className="task-filter-secondary"><div className="segmented" role="group" aria-label={w('quick')}>{(['all','mine','overdue'] as const).map(value=><button key={value} className={filters.quick===value?'selected':''} aria-pressed={filters.quick===value} onClick={()=>update({quick:value})}>{w(value==='all'?'allTasks':value)}</button>)}</div><span className="tiny muted" role="status">{w('results',{count:list.length})}</span></div>
   {advanced&&<div className="task-filter-advanced" id="task-advanced-filters">
    <label className="field"><span>{w('assignee')}</span><SelectMenu compact label={w('assignee')} value={filters.assignee} onChange={assignee=>update({assignee})} options={[{value:'',label:w('anyone')},{value:'unassigned',label:w('unassigned')},...(filters.assignee&&filters.assignee!=='unassigned'&&!members.some(m=>m.user_id===filters.assignee)?[{value:filters.assignee,label:w('filterUnavailable')}]:[]),...members.map(m=>memberOption(m))]} tabs={memberTabs(members,t)}/></label>
    <label className="field"><span>{w('status')}</span><SelectMenu compact label={w('status')} searchable={false} value={filters.status} onChange={status=>update({status:status as TaskFilters['status']})} options={[{value:'all',label:w('allStatuses')},...(['todo','doing','done'] as const).map(s=>({value:s,label:t(statusNames[s])}))]}/></label>
    <label className="field"><span>{w('due')}</span><SelectMenu compact label={w('due')} searchable={false} value={filters.due} onChange={due=>update({due:due as TaskFilters['due']})} options={(['all','today','week','none'] as const).map(s=>({value:s,label:w(s==='all'?'anyDate':s==='none'?'noDate':s)}))}/></label>
   </div>}
   {chips.length>0&&<div className="active-filter-row">{chips.map((chip,i)=><button className="filter-chip" key={i} onClick={chip.clear} aria-label={w('remove',{name:chip.label})}>{chip.label}<X size={12}/></button>)}<button className="text-button tiny" onClick={reset}>{w('reset')}</button></div>}
  </section>
  {!list.length?<section className="panel"><Empty title={w('noResults')} text={w('noResultsHint')} action={<button className="text-button" onClick={()=>{reset();onProject('');}}>{w('reset')}</button>}/></section>:<div className="task-board">{(['todo','doing','done'] as const).filter(status=>filters.status==='all'||filters.status===status).map(status=><section className={`task-column column-${status}`} key={status}><div className="task-column-title"><span className="column-dot"/><h2>{t(statusNames[status])}</h2><span>{list.filter(task=>task.status===status).length}</span></div>{list.filter(task=>task.status===status).map(task=>{
   const p=projects.find(p=>p.id===task.project_id),person=members.find(m=>m.user_id===task.assignee_id),overdue=task.status!=='done'&&!!task.due_date&&task.due_date<today;
   return <article className="task-card" key={task.id}><div className="task-project"><span style={{backgroundColor:p?.color}}/><button className="project-text-link" onClick={()=>onOpenProject(task.project_id)} aria-label={w('openProject',{name:p?.name||task.project_id})}>{p?.code||w('project')}<ArrowUpRight size={12}/></button><button className="icon-button" aria-label={t('Aufgabe {name} bearbeiten',{name:task.title})} onClick={()=>onEdit(task)}><MoreHorizontal size={17}/></button></div><button className="task-title" onClick={()=>onEdit(task)}>{task.title}</button><div className="task-meta"><span className={overdue?'overdue':''}>{task.due_date?<><CalendarDays size={13}/>{shortDate(task.due_date)}{overdue&&<span className="sr-only"> {w('overdue')}</span>}</>:t('Ohne Termin')}</span>{person?<span className="avatar tiny-avatar" title={person.display_name||person.email}>{initials(person.display_name||person.email)}</span>:<span className="tiny muted">{w('unassigned')}</span>}</div>{(task.is_milestone||task.estimated_minutes)&&<div className="task-planning-meta">{task.is_milestone&&<span><Flag size={12}/>{insightText(locale,'milestone')}</span>}{!!task.estimated_minutes&&<span>{formatInsightHours(task.estimated_minutes,locale)}</span>}</div>}<span className="task-status-field"><SelectMenu compact label={t('Status für {name}',{name:task.title})} searchable={false} value={task.status} disabled={busy} onChange={status=>onMove(task,status as Task['status'])} options={(['todo','doing','done'] as const).map(s=>({value:s,label:t(statusNames[s])}))}/></span></article>;
  })}{!list.some(task=>task.status===status)&&<div className="empty-column">{status==='done'?t('Hier landen eure Erfolge.'):status==='doing'?t('Bereit für euren nächsten Flow.'):t('Platz für den nächsten Schritt.')}</div>}</section>)}</div>}
 </>;
}
