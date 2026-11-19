import { hasTranslation } from './i18n.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { absenceSchema,date,dateRangeSchema,entrySchema,inviteSchema,rightsSchema,locationSchema,projectSchema,phaseSchema,serviceTypeSchema,planRowSchema,planCellSchema,planImportSchema,roleSchema,taskSchema,timerSchema,suggestionSchema,uuid,vacationBalanceSchema,workScheduleSchema,workspaceSchema } from './validation.js';
import type { Workspace,Membership,Invitation,Project,ProjectInput,Task,TaskInput,TimeEntry,EntryInput,RunningTimer,TimerInput,Role,Absence,AbsenceInput,AppNotification,VacationBalance,TimeSuggestion,TimeSuggestionInput,ProjectPhase,ProjectPhaseInput,ServiceType,PlanRow,PlanRowInput,PlanCell,PlanActual,PhaseEffort,PlanImport,PlanImportResult,SisterWorkspace,ProjectHandover } from './types.js';
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
  // Dazu zählt jeder Text, den der Sprachkatalog kennt – auch mit eigenem Fehlercode (fehlendes Recht, Überschneidung):
  // „Diese Person hat mehr Rechte als du“ hilft weiter, „Dafür fehlt die Berechtigung“ nicht. Unbekannte Texte bleiben verborgen.
  const controlled=!!error.message&&error.message.length<300&&(error.code==='P0001'||hasTranslation(error.message));
  throw new AppError(controlled ? error.message! : messages[error.code??'']??'Die Anfrage konnte nicht gespeichert oder geladen werden. Bitte erneut versuchen.',error.code);
}
async function one<T>(query:PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>):Promise<T>{const {data,error}=await query;fail(error);if(data===null)throw new AppError('Keine Daten zurückgegeben. Bitte neu laden.');return data as T;}
async function rows<T>(query:PromiseLike<{data:unknown;error:{code?:string;message?:string}|null;count?:number|null}>):Promise<T[]>{const{data,error,count}=await query;fail(error);if((count??0)>1000 || (Array.isArray(data)&&data.length>1000))throw new AppError('Mehr als 1.000 Einträge. Bitte Zeitraum oder Umfang verkleinern.','result_limit');return (data??[]) as T[];}
/** Liest alle Zeilen seitenweise: PostgREST liefert je Abruf höchstens 1.000, ein größeres `limit` ändert daran nichts.
 * Aufgaben und ihr Aufwand wachsen über die Jahre darüber hinaus; vorher brach die App dann mit „Mehr als 1.000 Einträge“ ab.
 * Die Abfrage braucht eine eindeutige Sortierung, sonst können Zeilen zwischen zwei Seiten doppelt oder gar nicht erscheinen. */
async function allRows<T>(page:(from:number,to:number)=>PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>,max=50000):Promise<T[]>{
 const out:T[]=[];
 for(let from=0;from<max;from+=1000){const{data,error}=await page(from,from+999);fail(error);const chunk=(Array.isArray(data)?data:[]) as T[];out.push(...chunk);if(chunk.length<1000)return out;}
 throw new AppError('Mehr als 50.000 Einträge. Bitte Umfang verkleinern.','result_limit');
}
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
  inviteMember:async(input:{workspace_id:string;email:string;role:'manager'|'member';template?:string})=>{const v=parse(inviteSchema,input);await rpcVoid('invite_member',{p_workspace_id:v.workspace_id,p_email:v.email,p_role:v.role,...(v.template?{p_template:v.template}:{})})},
  setMemberRights:(input:{workspace_id:string;user_id:string;template:string;permissions?:Record<string,string>})=>{const v=parse(rightsSchema,input);return rpc<Membership>('set_member_rights',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_template:v.template,p_permissions:v.template==='individuell'?v.permissions:null})},
  listInvitations:(workspaceId:string)=>rpc<Invitation[]>('list_invitations',{p_workspace_id:parse(uuid,workspaceId)}),
  revokeInvitation:async(id:string)=>{await rpcVoid('revoke_invitation',{p_id:parse(uuid,id)})},
  setMemberRole:async(input:{workspace_id:string;user_id:string;role:Role})=>{const v=parse(roleSchema,input);await rpcVoid('set_member_role',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_role:v.role})},
  setMemberLocation:(input:{workspace_id:string;user_id:string;location:string|null})=>{const v=parse(z.strictObject({workspace_id:uuid,user_id:uuid,location:locationSchema}),input);return rpc<Membership>('set_member_location',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_location:v.location})},
  setWorkspaceLocation:(input:{workspace_id:string;location:string|null})=>{const v=parse(z.strictObject({workspace_id:uuid,location:locationSchema}),input);return rpc<Workspace>('set_workspace_location',{p_workspace_id:v.workspace_id,p_location:v.location})},
  listSuggestions:(workspaceId:string)=>rows<TimeSuggestion>(client.from('time_suggestions').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).eq('status','pending').order('work_date',{ascending:false}).order('created_at').limit(501)),
  proposeSuggestions:async(input:TimeSuggestionInput[])=>{const list=input.slice(0,50).map(s=>parse(suggestionSchema,s));const withId=list.filter(s=>s.external_id),withoutId=list.filter(s=>!s.external_id);const out:TimeSuggestion[]=[];if(withId.length)out.push(...await rows<TimeSuggestion>(client.from('time_suggestions').upsert(withId,{onConflict:'workspace_id,user_id,external_id',ignoreDuplicates:true}).select()));if(withoutId.length)out.push(...await rows<TimeSuggestion>(client.from('time_suggestions').insert(withoutId).select()));return out},
  dismissSuggestion:(id:string)=>one<TimeSuggestion>(client.from('time_suggestions').update({status:'dismissed',decided_at:new Date().toISOString()}).eq('id',parse(uuid,id)).eq('status','pending').select().single()),
  acceptSuggestion:(input:{id:string;project_id:string;task_id:string|null;work_date:string;minutes:number;note:string;billable:boolean})=>{const v=parse(z.strictObject({id:uuid,project_id:uuid,task_id:uuid.nullable(),work_date:date,minutes:z.number().int().min(1).max(1440),note:z.string().max(2000),billable:z.boolean()}),input);return rpc<TimeEntry>('accept_time_suggestion',{p_id:v.id,p_project_id:v.project_id,p_task_id:v.task_id,p_work_date:v.work_date,p_minutes:v.minutes,p_note:v.note,p_billable:v.billable})},
  listTaskEffort:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<{task_id:string;minutes:number;entries:number;last_work_date:string}>((from,to)=>client.from('task_effort').select('task_id,minutes,entries,last_work_date').eq('workspace_id',w).order('task_id').range(from,to));},
  listProjectEffort:(workspaceId:string)=>rows<{project_id:string;minutes:number;entries:number;first_work_date:string;last_work_date:string}>(client.from('project_effort').select('project_id,minutes,entries,first_work_date,last_work_date',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).limit(1001)),
  setWorkSchedule:(input:{workspace_id:string;user_id:string;schedule:number[]|null;balance_start_on:string|null;balance_start_minutes:number})=>{const v=parse(workScheduleSchema,input);return rpc<Membership>('set_work_schedule',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_schedule:v.schedule,p_balance_start_on:v.balance_start_on,p_balance_start_minutes:v.balance_start_minutes})},
  setMemberCapacity:(input:{workspace_id:string;user_id:string;minutes:number|null})=>{const v=parse(z.strictObject({workspace_id:uuid,user_id:uuid,minutes:z.number().int().min(0).max(6000).nullable()}),input);return rpc<Membership>('set_member_capacity',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_minutes:v.minutes})},
  listAbsences:(workspaceId:string,from:string,to:string)=>{const v=parse(dateRangeSchema,{from,to});return rows<Absence>(client.from('absences').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).lte('starts_on',v.to).gte('ends_on',v.from).order('starts_on').order('id').limit(1001))},
  saveAbsence:(input:AbsenceInput&{id?:string})=>one<Absence>(client.from('absences').upsert(parse(absenceSchema,input)).select().single()),
  deleteAbsence:async(id:string)=>{await one(client.from('absences').delete().eq('id',parse(uuid,id)).select('id').single())},
  decideAbsence:(input:{id:string;approve:boolean})=>{const v=parse(z.strictObject({id:uuid,approve:z.boolean()}),input);return one<Absence>(client.from('absences').update({status:v.approve?'approved':'declined'}).eq('id',v.id).select().single())},
  listVacationBalances:(workspaceId:string,year:number)=>rows<VacationBalance>(client.from('vacation_balances').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).eq('year',parse(z.number().int().min(2000).max(2100),year)).order('user_id').limit(1001)),
  saveVacationBalance:(input:VacationBalance)=>one<VacationBalance>(client.from('vacation_balances').upsert(parse(vacationBalanceSchema,input)).select().single()),
  setVacationEntitlement:(input:{workspace_id:string;user_id:string;days:number|null})=>{const v=parse(z.strictObject({workspace_id:uuid,user_id:uuid,days:z.number().min(0).max(100).multipleOf(0.5).nullable()}),input);return rpc<Membership>('set_vacation_entitlement',{p_workspace_id:v.workspace_id,p_user_id:v.user_id,p_days:v.days})},
  setAbsenceApproval:(input:{workspace_id:string;required:boolean})=>{const v=parse(z.strictObject({workspace_id:uuid,required:z.boolean()}),input);return rpc<Workspace>('set_absence_approval',{p_workspace_id:v.workspace_id,p_required:v.required})},
  listProjects:(workspaceId:string)=>rows<Project>(client.from('projects').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).order('created_at').order('id').limit(1001)),
  getProjectInsight:(workspaceId:string,projectId:string)=>rpc<ProjectInsight>('project_insight',{p_workspace_id:parse(uuid,workspaceId),p_project_id:parse(uuid,projectId)}),
  saveProject:(input:ProjectInput&{id?:string})=>one<Project>(client.from('projects').upsert(parse(projectSchema,input)).select().single()),
  // Phasen und Leistungsarten: lesen dürfen alle Mitglieder (sie buchen darauf), pflegen die Planung.
  listPhases:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<ProjectPhase>((from,to)=>client.from('project_phases').select('*').eq('workspace_id',w).order('project_id').order('position').order('id').range(from,to));},
  savePhase:(input:ProjectPhaseInput&{id?:string})=>one<ProjectPhase>(client.from('project_phases').upsert(parse(phaseSchema,input)).select().single()),
  deletePhase:async(id:string)=>{await one(client.from('project_phases').delete().eq('id',parse(uuid,id)).select('id').single())},
  listServiceTypes:(workspaceId:string)=>rows<ServiceType>(client.from('service_types').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).order('position').order('name').limit(1001)),
  saveServiceType:(input:{id?:string;workspace_id:string;name:string;position:number;active:boolean})=>one<ServiceType>(client.from('service_types').upsert(parse(serviceTypeSchema,input)).select().single()),
  deleteServiceType:async(id:string)=>{await one(client.from('service_types').delete().eq('id',parse(uuid,id)).select('id').single())},
  // Kapazitätsplan: Zeilen ganz, Wochenwerte und gebuchte Zeit nur für den sichtbaren Ausschnitt, Summen je Zeile über alles.
  listPlanRows:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<PlanRow>((from,to)=>client.from('capacity_rows').select('*').eq('workspace_id',w).order('project_id').order('position').order('id').range(from,to));},
  listPlanCells:(workspaceId:string,from:string,to:string)=>{const w=parse(uuid,workspaceId),a=parse(date,from),b=parse(date,to);return allRows<PlanCell>((start,end)=>client.from('capacity_cells').select('*').eq('workspace_id',w).gte('week_start',a).lte('week_start',b).order('row_id').order('week_start').range(start,end));},
  listPlanTotals:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<{row_id:string;minutes:number;first_week:string;last_week:string}>((from,to)=>client.from('capacity_row_totals').select('row_id,minutes,first_week,last_week').eq('workspace_id',w).order('row_id').range(from,to));},
  listPlanActuals:(workspaceId:string,from:string,to:string)=>{const w=parse(uuid,workspaceId),a=parse(date,from),b=parse(date,to);return allRows<PlanActual>((start,end)=>client.from('capacity_actuals').select('project_id,user_id,week_start,minutes').eq('workspace_id',w).gte('week_start',a).lte('week_start',b).order('project_id').order('user_id').order('week_start').range(start,end));},
  listPhaseEffort:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<PhaseEffort>((from,to)=>client.from('phase_effort').select('project_id,phase_id,service_type_id,minutes,billable_minutes,entries').eq('workspace_id',w).order('project_id').order('phase_id').order('service_type_id').range(from,to));},
  listPhasePlan:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<{project_id:string;phase_id:string;minutes:number}>((from,to)=>client.from('phase_plan').select('project_id,phase_id,minutes').eq('workspace_id',w).order('phase_id').range(from,to));},
  savePlanRow:(input:PlanRowInput&{id?:string})=>one<PlanRow>(client.from('capacity_rows').upsert(parse(planRowSchema,input)).select().single()),
  deletePlanRow:async(id:string)=>{await one(client.from('capacity_rows').delete().eq('id',parse(uuid,id)).select('id').single())},
  /** Schreibt Wochenwerte: 0 löscht die Zelle, alles andere setzt sie. */
  setPlanCells:async(cells:PlanCell[])=>{const list=cells.slice(0,2000).map(c=>parse(planCellSchema,c));const keep=list.filter(c=>c.minutes>0),drop=list.filter(c=>c.minutes===0);
   if(keep.length){const{error}=await client.from('capacity_cells').upsert(keep,{onConflict:'row_id,week_start'});fail(error);}
   for(const c of drop){const{error}=await client.from('capacity_cells').delete().eq('row_id',c.row_id).eq('week_start',c.week_start);fail(error);}},
  importPlan:(workspaceId:string,plan:PlanImport)=>rpc<PlanImportResult>('import_capacity_plan',{p_workspace_id:parse(uuid,workspaceId),p_plan:parse(planImportSchema,plan)}),
  listTasks:(workspaceId:string)=>{const w=parse(uuid,workspaceId);return allRows<Task>((from,to)=>client.from('tasks').select('*').eq('workspace_id',w).order('created_at').order('id').range(from,to));},
  // Erst ändern, dann anlegen: Ein Upsert ist für die Datenbank immer auch ein Einfügen und braucht das Recht, Aufgaben
  // anzulegen. Wer nur die eigene Aufgabe bearbeiten darf (zugewiesen, ohne Aufgabenrecht), scheiterte damit an jedem Statuswechsel.
  saveTask:async(input:TaskInput&{id?:string})=>{const v=parse(taskSchema,input);if(v.id){const{id,...fields}=v;const{data,error}=await client.from('tasks').update(fields).eq('id',id).eq('workspace_id',v.workspace_id).select();fail(error);if(Array.isArray(data)&&data.length===1)return data[0] as Task;}return one<Task>(client.from('tasks').upsert(v).select().single());},
  deleteTask:async(id:string)=>{await one(client.from('tasks').delete().eq('id',parse(uuid,id)).select('id').single())},
  listEntries:(workspaceId:string,from:string,to:string)=>{const v=parse(dateRangeSchema,{from,to}),w=parse(uuid,workspaceId);return readTimeEntryPages((start,end)=>client.from('time_entries').select('*',{count:'exact'}).eq('workspace_id',w).gte('work_date',v.from).lte('work_date',v.to).order('work_date',{ascending:false}).order('created_at',{ascending:false}).order('id').range(start,end),fail,code=>new AppError(code==='time_entry_limit'?'Mehr als 50.000 Zeiteinträge. Bitte Zeitraum verkleinern.':'Zeiteinträge konnten nicht vollständig geladen werden. Bitte neu laden und erneut versuchen.',code))},
  saveEntry:(input:EntryInput&{id?:string})=>one<TimeEntry>(client.from('time_entries').upsert(parse(entrySchema,input)).select().single()),
  deleteEntry:async(id:string)=>{await one(client.from('time_entries').delete().eq('id',parse(uuid,id)).select('id').single())},
  submitEntries:(input:{workspace_id:string;from:string;to:string})=>{const {workspace_id,...range}=input;const v=parse(dateRangeSchema,range);return rpc<number>('submit_entries',{p_workspace_id:parse(uuid,workspace_id),p_from:v.from,p_to:v.to})},
  reviewEntry:(input:{id:string;approve:boolean})=>{const v=parse(z.strictObject({id:uuid,approve:z.boolean()}),input);return rpc<TimeEntry>('review_entry',{p_id:v.id,p_approve:v.approve})},
  reviewEntries:(input:{workspace_id:string;ids:string[];approve:boolean})=>{const v=parse(z.strictObject({workspace_id:uuid,ids:z.array(uuid).min(1).max(500),approve:z.boolean()}),input);return rpc<number>('review_entries',{p_workspace_id:v.workspace_id,p_ids:v.ids,p_approve:v.approve})},
  revokeApproval:(id:string)=>rpc<TimeEntry>('revoke_approval',{p_id:parse(uuid,id)}),
  // Range-independent approval queue: how many submitted entries exist in the
  // workspace at all, and the oldest work date, so the review view can widen
  // its range to cover them (RLS scopes members to their own entries).
  approvalQueue:async(workspaceId:string)=>{const {data,error,count}=await client.from('time_entries').select('work_date',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).eq('status','submitted').order('work_date',{ascending:true}).limit(1);fail(error);return {count:count??0,oldest:(data as {work_date:string}[]|null)?.[0]?.work_date??null};},
  renameWorkspace:(input:{workspace_id:string;name:string})=>{const v=parse(z.strictObject({workspace_id:uuid,name:z.string().trim().min(1).max(100)}),input);return rpc<Workspace>('rename_workspace',{p_workspace_id:v.workspace_id,p_name:v.name})},
  setDisplayName:(input:{workspace_id:string;name:string})=>{const v=parse(z.strictObject({workspace_id:uuid,name:z.string().trim().min(1).max(120)}),input);return rpc<Membership>('set_display_name',{p_workspace_id:v.workspace_id,p_name:v.name})},
  // Ungelesene In-App-Benachrichtigungen (RLS liefert nur eigene Zeilen).
  listNotifications:(workspaceId:string)=>rows<AppNotification>(client.from('notifications').select('*',{count:'exact'}).eq('workspace_id',parse(uuid,workspaceId)).is('read_at',null).order('created_at').order('id').limit(1001)),
  markNotificationsRead:(workspaceId:string)=>rpc<number>('mark_notifications_read',{p_workspace_id:parse(uuid,workspaceId)}),
  getTimer:async()=>{const {data,error}=await client.from('running_timers').select('*').maybeSingle();fail(error);return data as RunningTimer|null},
  startTimer:(input:TimerInput)=>{const v=parse(timerSchema,input);return rpc<RunningTimer>('start_timer',{p_workspace_id:v.workspace_id,p_project_id:v.project_id,p_note:v.note,p_billable:v.billable,p_task_id:v.task_id??null})},
  stopTimer:(id:string)=>rpc<TimeEntry[]>('stop_timer',{p_timer_id:parse(uuid,id)}),
  discardTimer:async(id:string)=>{await rpcVoid('discard_timer',{p_timer_id:parse(uuid,id)})},
  // Firmenverbund: Schwesterfirmen und Projektübergaben. Die Rechte prüft die Datenbank in beiden Firmen.
  listSisters:(workspaceId:string)=>rpc<SisterWorkspace[]>('sister_workspaces',{p_workspace_id:parse(uuid,workspaceId)}),
  linkWorkspaces:async(input:{workspace_id:string;other_workspace_id:string})=>{const v=parse(z.strictObject({workspace_id:uuid,other_workspace_id:uuid}),input);await rpcVoid('link_workspaces',{p_workspace_id:v.workspace_id,p_other_workspace_id:v.other_workspace_id})},
  unlinkWorkspaces:async(input:{workspace_id:string;other_workspace_id:string})=>{const v=parse(z.strictObject({workspace_id:uuid,other_workspace_id:uuid}),input);await rpcVoid('unlink_workspaces',{p_workspace_id:v.workspace_id,p_other_workspace_id:v.other_workspace_id})},
  listHandovers:(workspaceId:string)=>{const id=parse(uuid,workspaceId);return rows<ProjectHandover>(client.from('project_handovers').select('*',{count:'exact'}).or(`source_workspace_id.eq.${id},target_workspace_id.eq.${id}`).order('offered_at',{ascending:false}).limit(100))},
  offerHandover:(input:{project_id:string;target_workspace_id:string;note?:string})=>{const v=parse(z.strictObject({project_id:uuid,target_workspace_id:uuid,note:z.string().trim().max(1000).default('')}),input);return rpc<ProjectHandover>('offer_project_handover',{p_project_id:v.project_id,p_target_workspace_id:v.target_workspace_id,p_note:v.note})},
  acceptHandover:(id:string)=>rpc<ProjectHandover>('accept_project_handover',{p_handover_id:parse(uuid,id)}),
  declineHandover:(id:string)=>rpc<ProjectHandover>('decline_project_handover',{p_handover_id:parse(uuid,id)}),
  withdrawHandover:(id:string)=>rpc<ProjectHandover>('withdraw_project_handover',{p_handover_id:parse(uuid,id)})
 };
}
export type Service=ReturnType<typeof createService>;
