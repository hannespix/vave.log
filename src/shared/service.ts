import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { dateRangeSchema,entrySchema,inviteSchema,projectSchema,roleSchema,taskSchema,timerSchema,uuid,workspaceSchema } from './validation.js';
import type { Workspace,Membership,Project,ProjectInput,Task,TaskInput,TimeEntry,EntryInput,RunningTimer,TimerInput,Role } from './types.js';
import type { ProjectInsight } from './project-insight-types.js';
import { readTimeEntryPages } from './time-entry-pages.js';

export class AppError extends Error { constructor(message:string,public code='request_failed'){super(message);this.name='AppError'} }
function fail(error:{code?:string;message?:string}|null) {
  if(!error) return;
  const messages:Record<string,string>={
    '42501':'Dafür fehlt die Berechtigung.','23503':'Projekt, Person oder Workspace passen nicht zusammen.',
    '23505':'Dieser Eintrag existiert bereits. Bitte den aktuellen Stand laden.',
    '23514':'Diese Änderung verletzt eine Datenregel. Bitte Eingaben prüfen.',
    'PGRST116':'Eintrag nicht gefunden oder kein Zugriff.','PGRST301':'Die Sitzung ist abgelaufen. Bitte erneut anmelden.',
    'PGRST205':'Die Datenbank ist noch nicht eingerichtet. Bitte die Migration anwenden.'
  };
  // Only controlled exceptions intentionally raised by our migration reach the user.
  throw new AppError(error.code==='P0001' && error.message && error.message.length<300 ? error.message : messages[error.code??'']??'Die Anfrage konnte nicht gespeichert oder geladen werden. Bitte erneut versuchen.',error.code);
}
async function one<T>(query:PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>):Promise<T>{const {data,error}=await query;fail(error);if(data===null)throw new AppError('Keine Daten zurückgegeben. Bitte neu laden.');return data as T;}
async function rows<T>(query:PromiseLike<{data:unknown;error:{code?:string;message?:string}|null;count?:number|null}>):Promise<T[]>{const{data,error,count}=await query;fail(error);if((count??0)>1000 || (Array.isArray(data)&&data.length>1000))throw new AppError('Mehr als 1.000 Einträge. Bitte Zeitraum oder Umfang verkleinern.','result_limit');return (data??[]) as T[];}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new AppError('Bitte Eingaben prüfen: '+r.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ').slice(0,350),'validation');return r.data;}

/** Both the browser and MCP use a publishable key plus the acting user's access token.
 * Access checks belong to Postgres RLS/RPC, never to a client-supplied role. */
export function createService(client:SupabaseClient){
 const rpc=<T>(name:string,args:Record<string,unknown>={})=>one<T>(client.rpc(name,args));
 const rpcVoid=async(name:string,args:Record<string,unknown>)=>{const {error}=await client.rpc(name,args);fail(error)};
 return {
  listWorkspaces:()=>rows<Workspace>(client.from('workspaces').select('*',{count:'exact'}).order('created_at').order('id').limit(1001)),
  getMemberships:(workspaceId:string)=>rows<Membership>(client.from('memberships').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).order('created_at').order('user_id').limit(1001)),
  createWorkspace:(input:{name:string;timezone:string;currency:string})=>{const v=parse(workspaceSchema,input);return rpc<Workspace>('create_workspace',{p_name:v.name,p_timezone:v.timezone,p_currency:v.currency})},
  acceptInvitations:()=>rpc<number>('accept_invitations'),
  inviteMember:async(input:{workspace_id:string;email:string;role:'manager'|'member'})=>{const v=parse(inviteSchema,input);await rpcVoid('invite_member',{p_workspace_id:v.workspace_id,p_email:v.email,p_role:v.role})},
  setMemberRole:async(input:{workspace_id:string;user_id:string;role:Role})=>{const v=parse(roleSchema,input);await rpcVoid('set_member_role',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_role:v.role})},
  listProjects:(workspaceId:string)=>rows<Project>(client.from('projects').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).order('created_at').order('id').limit(1001)),
  getProjectInsight:(workspaceId:string,projectId:string)=>rpc<ProjectInsight>('project_insight',{p_workspace_id:parse(uuid,workspaceId),p_project_id:parse(uuid,projectId)}),
  saveProject:(input:ProjectInput&{id?:string})=>one<Project>(client.from('projects').upsert(parse(projectSchema,input)).select().single()),
  listTasks:(workspaceId:string)=>rows<Task>(client.from('tasks').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).order('created_at').order('id').limit(1001)),
  saveTask:(input:TaskInput&{id?:string})=>one<Task>(client.from('tasks').upsert(parse(taskSchema,input)).select().single()),
  deleteTask:async(id:string)=>{await one(client.from('tasks').delete().eq('id',parse(uuid,id)).select('id').single())},
  listEntries:(workspaceId:string,from:string,to:string)=>{const v=parse(dateRangeSchema,{from,to}),w=parse(uuid,workspaceId);return readTimeEntryPages((start,end)=>client.from('time_entries').select('*',{count:'exact'}).eq('workspace_id',w).gte('work_date',v.from).lte('work_date',v.to).order('work_date',{ascending:false}).order('created_at',{ascending:false}).order('id').range(start,end),fail,code=>new AppError(code==='time_entry_limit'?'Mehr als 50.000 Zeiteinträge. Bitte Zeitraum verkleinern.':'Zeiteinträge konnten nicht vollständig geladen werden. Bitte neu laden und erneut versuchen.',code))},
  saveEntry:(input:EntryInput&{id?:string})=>one<TimeEntry>(client.from('time_entries').upsert(parse(entrySchema,input)).select().single()),
  deleteEntry:async(id:string)=>{await one(client.from('time_entries').delete().eq('id',parse(uuid,id)).select('id').single())},
  submitEntries:(input:{workspace_id:string;from:string;to:string})=>{const {workspace_id,...range}=input;const v=parse(dateRangeSchema,range);return rpc<number>('submit_entries',{p_workspace_id:parse(uuid,workspace_id),p_from:v.from,p_to:v.to})},
  reviewEntry:(input:{id:string;approve:boolean})=>{const v=parse(z.strictObject({id:uuid,approve:z.boolean()}),input);return rpc<TimeEntry>('review_entry',{p_id:v.id,p_approve:v.approve})},
  getTimer:async()=>{const {data,error}=await client.from('running_timers').select('*').maybeSingle();fail(error);return data as RunningTimer|null},
  startTimer:(input:TimerInput)=>{const v=parse(timerSchema,input);return rpc<RunningTimer>('start_timer',{p_workspace_id:v.workspace_id,p_project_id:v.project_id,p_note:v.note,p_billable:v.billable})},
  stopTimer:(id:string)=>rpc<TimeEntry[]>('stop_timer',{p_timer_id:parse(uuid,id)}),
  discardTimer:async(id:string)=>{await rpcVoid('discard_timer',{p_timer_id:parse(uuid,id)})}
 };
}
export type Service=ReturnType<typeof createService>;
