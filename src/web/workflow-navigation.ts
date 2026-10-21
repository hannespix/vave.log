import type { Project, Task } from '../shared/types';
import { addDays } from './helpers';

export type WorkflowView = 'overview'|'projects'|'tasks'|'time'|'absences'|'planning'|'reports'|'team'|'finance'|'settings'|'help';
export type FinanceTab = 'overview'|'clients'|'planning'|'invoices'|'offers'|'company';
export type TaskFilters = {query:string;quick:'all'|'mine'|'overdue';status:'all'|Task['status'];assignee:string;due:'all'|'today'|'week'|'none'};
export type WorkflowRoute = {workspaceId:string;view:WorkflowView;projectId:string;financeTab:FinanceTab;taskFilters:TaskFilters;timeScope:'own'|'team';entryStatus:'all'|'draft'|'submitted'|'approved';personId:string;invoiceId:string;helpTopic:string};
export type WorkflowTarget = {view:WorkflowView;projectId?:string;financeTab?:FinanceTab;taskFilters?:TaskFilters;timeScope?:'own'|'team';entryStatus?:WorkflowRoute['entryStatus'];personId?:string;invoiceId?:string;helpTopic?:string};
export const emptyTaskFilters = ():TaskFilters => ({query:'',quick:'all',status:'all',assignee:'',due:'all'});
export const initialWorkflow=(workspaceId:string):WorkflowRoute=>({workspaceId,view:'overview',projectId:'',financeTab:'overview',taskFilters:emptyTaskFilters(),timeScope:'own',entryStatus:'all',personId:'',invoiceId:'',helpTopic:''});
/** A requested but inaccessible workspace never falls back to unrelated data. */
export function resolveWorkflowWorkspace(hash:string,authorizedIds:string[]):string|null {
 if(!hash.startsWith('#w='))return authorizedIds[0]??'';
 const requested=new URLSearchParams(hash.slice(1)).get('w')??'';
 return authorizedIds.includes(requested)?requested:null;
}
export function nextWorkflow(current:WorkflowRoute,target:WorkflowTarget):WorkflowRoute {
 const defined=Object.fromEntries(Object.entries(target).filter(([,value])=>value!==undefined)) as WorkflowTarget;
 const changedProject=defined.projectId!==undefined&&defined.projectId!==current.projectId;
 return {...current,...(changedProject?{taskFilters:emptyTaskFilters(),personId:'',entryStatus:'all' as const,invoiceId:''}:{}),...defined};
}
const choice=<T extends string>(value:string|null,values:readonly T[],fallback:T):T=>values.includes(value as T)?value as T:fallback;
export function parseWorkflowHash(hash:string,workspaceId:string):WorkflowRoute {
 const initial=initialWorkflow(workspaceId);
 if(!hash.startsWith('#w='))return initial;
 const p=new URLSearchParams(hash.slice(1));
 if(p.get('w')!==workspaceId)return initial;
 return {...initial,view:choice(p.get('view'),['overview','projects','tasks','time','absences','planning','reports','team','finance','settings','help'],'overview'),projectId:(p.get('project')||'').slice(0,80),financeTab:choice(p.get('tab'),['overview','clients','planning','invoices','offers','company'],'overview'),timeScope:choice(p.get('scope'),['own','team'],'own'),entryStatus:choice(p.get('entry'),['all','draft','submitted','approved'],'all'),personId:(p.get('person')||'').slice(0,80),invoiceId:(p.get('inv')||'').slice(0,80),helpTopic:(p.get('topic')||'').slice(0,80),taskFilters:{query:(p.get('q')||'').slice(0,240),quick:choice(p.get('quick'),['all','mine','overdue'],'all'),status:choice(p.get('status'),['all','todo','doing','done'],'all'),assignee:(p.get('assignee')||'').slice(0,80),due:choice(p.get('due'),['all','today','week','none'],'all')}};
}
export function workflowHash(route:WorkflowRoute):string {
 const p=new URLSearchParams({w:route.workspaceId,view:route.view});
 for(const [key,value] of Object.entries({project:route.projectId,tab:route.financeTab==='overview'?'':route.financeTab,scope:route.timeScope==='own'?'':route.timeScope,entry:route.entryStatus==='all'?'':route.entryStatus,person:route.personId,inv:route.invoiceId,topic:route.helpTopic,q:route.taskFilters.query,quick:route.taskFilters.quick==='all'?'':route.taskFilters.quick,status:route.taskFilters.status==='all'?'':route.taskFilters.status,assignee:route.taskFilters.assignee,due:route.taskFilters.due==='all'?'':route.taskFilters.due}))if(value)p.set(key,value);
 return '#'+p.toString();
}
export function scopeProjects(projects:Project[],projectId:string):Project[]{return projectId?projects.filter(p=>p.id===projectId):projects;}
export function filterTasks(tasks:Task[],projects:Project[],projectId:string,filters:TaskFilters,userId:string,today:string):Task[]{
 const query=filters.query.trim().toLocaleLowerCase(),projectNames=new Map(projects.map(p=>[p.id,`${p.code} ${p.name} ${p.client}`]));
 return tasks.filter(task=>(!projectId||task.project_id===projectId)
  &&(filters.quick!=='mine'||task.assignee_id===userId)
  &&(filters.quick!=='overdue'||task.status!=='done'&&!!task.due_date&&task.due_date<today)
  &&(filters.status==='all'||task.status===filters.status)
  &&(!filters.assignee||(filters.assignee==='unassigned'?!task.assignee_id:task.assignee_id===filters.assignee))
  &&(filters.due==='all'||filters.due==='none'&&!task.due_date||filters.due==='today'&&task.due_date===today||filters.due==='week'&&!!task.due_date&&task.due_date>=today&&task.due_date<=addDays(today,6))
  &&(!query||`${task.title} ${projectNames.get(task.project_id)||''}`.toLocaleLowerCase().includes(query)))
  .sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')||a.id.localeCompare(b.id));
}
