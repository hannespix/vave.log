import { describe, expect, it } from 'vitest';
import { parseWorkflowHash, workflowHash, initialWorkflow, scopeProjects, filterTasks, emptyTaskFilters, nextWorkflow, resolveWorkflowWorkspace } from '../src/web/workflow-navigation';
import type { Project, Task } from '../src/shared/types';
const ws='22222222-2222-4222-8222-222222222222', a='33333333-3333-4333-8333-333333333333', b='44444444-4444-4444-8444-444444444444';
const projects=[{id:a,code:'A',name:'Spatial Stories',client:'Museum'},{id:b,code:'B',name:'Launch',client:'Bank'}] as Project[];
const task=(id:string,project_id:string,status:Task['status'],due_date:string|null,assignee_id:string|null,title='Sketch')=>({id,project_id,status,due_date,assignee_id,title,created_at:'2026-10-01'} as Task);
const tasks=[task('1',a,'todo','2026-10-13','me'),task('2',a,'doing','2026-10-14','you'),task('3',b,'done','2026-10-12','me'),task('4',b,'todo',null,null),task('5',a,'todo','2026-10-20','me')];
describe('workspace navigation',()=>{
 it('restores only an authorized workspace from a deep link and fails closed for unknown workspaces',()=>{
  expect(resolveWorkflowWorkspace(`#w=${b}&view=tasks&project=${a}`,[ws,b])).toBe(b);
  expect(resolveWorkflowWorkspace('#w=missing&view=tasks',[ws,b])).toBeNull();
  expect(resolveWorkflowWorkspace('#w=&view=tasks',[ws,b])).toBeNull();
  expect(resolveWorkflowWorkspace('',[ws,b])).toBe(ws);
  expect(resolveWorkflowWorkspace('',[])).toBe('');
 });
 it('round trips selected project, task filters and finance target without auth query parameters',()=>{
  const route={...initialWorkflow(ws),view:'finance' as const,projectId:a,financeTab:'invoices' as const,taskFilters:{...emptyTaskFilters(),query:'A & 中文',quick:'mine' as const}};
  expect(parseWorkflowHash(workflowHash(route),ws)).toEqual(route);
  expect(workflowHash(route)).not.toContain('code=');
 });
 it('round trips an invoice target and a help topic, and a project change drops the invoice',()=>{
  const route={...initialWorkflow(ws),view:'finance' as const,projectId:a,financeTab:'invoices' as const,invoiceId:b};
  expect(parseWorkflowHash(workflowHash(route),ws)).toEqual(route);
  const help={...initialWorkflow(ws),view:'help' as const,helpTopic:'zeiten-einreichen'};
  expect(parseWorkflowHash(workflowHash(help),ws)).toEqual(help);
  expect(parseWorkflowHash(`#w=${ws}&view=help&topic=${'x'.repeat(200)}&inv=${'y'.repeat(200)}`,ws)).toMatchObject({view:'help',helpTopic:'x'.repeat(80),invoiceId:'y'.repeat(80)});
  expect(nextWorkflow(route,{view:'finance',projectId:b}).invoiceId).toBe('');
  expect(nextWorkflow(route,{view:'finance',projectId:b,invoiceId:a}).invoiceId).toBe(a);
  expect(nextWorkflow(route,{view:'finance',financeTab:'overview'}).invoiceId).toBe(b);
 });
 it('does not inherit another workspace or parse an auth fragment as workflow navigation',()=>{
  expect(parseWorkflowHash(workflowHash({...initialWorkflow(ws),view:'tasks',projectId:a}),'another')).toEqual(initialWorkflow('another'));
  expect(parseWorkflowHash('#access_token=secret',ws)).toEqual(initialWorkflow(ws));
 });
 it('retains an unavailable project scope instead of broadening to all',()=>{
  const route=parseWorkflowHash(`#w=${ws}&view=tasks&project=missing`,ws);
  expect(route.projectId).toBe('missing');expect(scopeProjects(projects,route.projectId)).toEqual([]);
  expect(scopeProjects(projects,'')).toHaveLength(2);
 });
 it('validates enumerations and bounds search input',()=>{
  const r=parseWorkflowHash(`#w=${ws}&view=evil&tab=evil&quick=evil&status=evil&due=evil&q=${'x'.repeat(400)}`,ws);
  expect(r.view).toBe('overview');expect(r.financeTab).toBe('overview');expect(r.taskFilters.quick).toBe('all');expect(r.taskFilters.status).toBe('all');expect(r.taskFilters.due).toBe('all');expect(r.taskFilters.query).toHaveLength(240);
 });
 it('ignores undefined target fields and clears conflicting filters when changing projects',()=>{
  const current={...initialWorkflow(ws),projectId:a,financeTab:'invoices' as const,entryStatus:'submitted' as const,personId:'me',taskFilters:{...emptyTaskFilters(),quick:'mine' as const}};
  const result=nextWorkflow(current,{view:'tasks',projectId:b,financeTab:undefined});
  expect(result.financeTab).toBe('invoices');expect(result.taskFilters).toEqual(emptyTaskFilters());expect(result.entryStatus).toBe('all');expect(result.personId).toBe('');
 });
});
describe('task filters',()=>{
 const select=(filters:Partial<ReturnType<typeof emptyTaskFilters>>={},projectId='')=>filterTasks(tasks,projects,projectId,{...emptyTaskFilters(),...filters},'me','2026-10-14').map(t=>t.id);
 it('combines project and mine without unrelated completed tasks',()=>{expect(select({quick:'mine'},a)).toEqual(['1','5'])});
 it('overdue excludes completed tasks and tasks due today',()=>{expect(select({quick:'overdue'})).toEqual(['1'])});
 it('filters the next seven calendar days including today and day six',()=>{expect(select({due:'week'})).toEqual(['2','5'])});
 it('combines status, assignee and search including project metadata',()=>{expect(select({status:'doing',assignee:'you',query:'museum'})).toEqual(['2']);expect(select({assignee:'unassigned'})).toEqual(['4'])});
 it('never falls back to all on unknown project or assignee',()=>{expect(select({},'missing')).toEqual([]);expect(select({assignee:'missing'})).toEqual([])});
 it('reset includes every task with stable due-date sorting and undated last',()=>{expect(select()).toEqual(['3','1','2','5','4'])});
});
