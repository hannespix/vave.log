import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { BillingProfile,Expense,ExpenseInput,FinanceClient,FinanceClientInput,FinanceOverview,Invoice,InvoiceDraftInput,ProjectPlan,ProjectPlanInput,StaffRate,StaffRateInput,TimeInvoiceInput } from './finance-types.js';
import type { Project } from './types.js';
import { billingProfileSchema,clientSchema,expenseSchema,financeRangeSchema,financeUuid,invoiceDraftSchema,paymentSchema,projectPlanSchema,staffRateSchema,timeInvoiceSchema } from './finance-validation.js';
import { projectFinancials } from './finance-math.js';
import { readTimeEntryPages,type TimeEntryPageError } from './time-entry-pages.js';
export type FinanceErrorCode='validation'|'forbidden'|'not_found'|'conflict'|'missing_configuration'|'result_limit'|'database'|TimeEntryPageError;
const messages:Record<FinanceErrorCode,string>={validation:'Please check the financial input.',forbidden:'You do not have permission to access these financial records.',not_found:'The financial record was not found.',conflict:'This financial record changed or is already in use.',missing_configuration:'Complete the company, customer and rate settings before continuing.',result_limit:'More than 1,000 records matched. Please narrow the date range or scope.',time_entry_limit:'More than 50,000 time entries matched. Please narrow the date range.',result_incomplete:'Time entries could not be loaded completely. Please reload and try again.',database:'The financial request could not be completed. Please try again.'};
export class FinanceError extends Error {readonly code:FinanceErrorCode;constructor(code:FinanceErrorCode){super(messages[code]);this.name='FinanceError';this.code=code}}
type DbError={code?:string;message?:string};
type Result={data:unknown;error:DbError|null;count?:number|null};
function fail(error:DbError|null){if(!error)return;const message=error.message??'';let code:FinanceErrorCode='database';if(message.includes('FINANCE_FORBIDDEN')||error.code==='42501')code='forbidden';else if(message.includes('FINANCE_NOT_FOUND')||error.code==='PGRST116')code='not_found';else if(message.includes('FINANCE_CONFLICT')||error.code==='23505')code='conflict';else if(message.includes('FINANCE_CONFIGURATION'))code='missing_configuration';else if(message.includes('FINANCE_LIMIT'))code='result_limit';else if(message.includes('FINANCE_VALIDATION')||error.code?.startsWith('22')||['23502','23503','23514'].includes(error.code??''))code='validation';throw new FinanceError(code)}
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const v=schema.safeParse(input);if(!v.success)throw new FinanceError('validation');return v.data}
async function one<T>(query:PromiseLike<Result>):Promise<T>{const r=await query;fail(r.error);if(r.data===null)throw new FinanceError('not_found');return r.data as T}
async function optional<T>(query:PromiseLike<Result>):Promise<T|null>{const r=await query;fail(r.error);return r.data as T|null}
async function list<T>(query:PromiseLike<Result>):Promise<T[]>{const r=await query;fail(r.error);if((r.count??0)>1000||(Array.isArray(r.data)&&r.data.length>1000))throw new FinanceError('result_limit');return (r.data??[]) as T[]}
/** User-scoped client only. Postgres authorizes every financial read/write. */
export function createFinanceService(client:SupabaseClient){
 const id=(v:string)=>parse(financeUuid,v);
 const rpc=<T>(name:string,args:Record<string,unknown>)=>one<T>(client.rpc(name,args));
 const scoped=(workspace_id:string,invoice_id:string)=>({p_workspace_id:id(workspace_id),p_id:id(invoice_id)});
 const service={
  listClients:(workspace_id:string)=>list<FinanceClient>(client.from('finance_clients').select('*',{count:'exact'}).eq('workspace_id',id(workspace_id)).order('name').order('id').limit(1001)),
  saveClient:(input:FinanceClientInput)=>one<FinanceClient>(client.from('finance_clients').upsert(parse(clientSchema,input)).select().single()),
  getProfile:(workspace_id:string)=>optional<BillingProfile>(client.from('finance_billing_profiles').select('*').eq('workspace_id',id(workspace_id)).maybeSingle()),
  saveProfile:(input:BillingProfile)=>one<BillingProfile>(client.from('finance_billing_profiles').upsert(parse(billingProfileSchema,input),{onConflict:'workspace_id'}).select().single()),
  listRates:(workspace_id:string)=>list<StaffRate>(client.from('finance_staff_rates').select('*',{count:'exact'}).eq('workspace_id',id(workspace_id)).order('effective_from',{ascending:false}).order('id').limit(1001)),
  saveRate:(input:StaffRateInput)=>one<StaffRate>(client.from('finance_staff_rates').upsert(parse(staffRateSchema,input)).select().single()),
  getProjectPlan:(workspace_id:string,project_id:string)=>optional<ProjectPlan>(client.from('finance_project_plans').select('*').eq('workspace_id',id(workspace_id)).eq('project_id',id(project_id)).maybeSingle()),
  listProjectPlans:(workspace_id:string)=>list<ProjectPlan>(client.from('finance_project_plans').select('*',{count:'exact'}).eq('workspace_id',id(workspace_id)).order('project_id').limit(1001)),
  saveProjectPlan:(input:ProjectPlanInput)=>one<ProjectPlan>(client.from('finance_project_plans').upsert(parse(projectPlanSchema,input),{onConflict:'workspace_id,project_id'}).select().single()),
  listExpenses:(workspace_id:string,from:string,to:string)=>{const range=parse(financeRangeSchema,{from,to});return list<Expense>(client.from('finance_expenses').select('*',{count:'exact'}).eq('workspace_id',id(workspace_id)).gte('expense_date',range.from).lte('expense_date',range.to).order('expense_date',{ascending:false}).order('id').limit(1001))},
  saveExpense:(input:ExpenseInput)=>one<Expense>(client.from('finance_expenses').upsert(parse(expenseSchema,input)).select().single()),
  deleteExpense:async(workspace_id:string,expense_id:string):Promise<void>=>{await one(client.from('finance_expenses').delete().eq('workspace_id',id(workspace_id)).eq('id',id(expense_id)).select('id').single())},
  listInvoices:(workspace_id:string)=>rpc<Invoice[]>('finance_list_invoices',{p_workspace_id:id(workspace_id)}),
  getInvoice:(workspace_id:string,invoice_id:string)=>rpc<Invoice>('finance_get_invoice',scoped(workspace_id,invoice_id)),
  saveInvoiceDraft:(input:InvoiceDraftInput)=>rpc<Invoice>('finance_save_draft',{p_input:parse(invoiceDraftSchema,input)}),
  draftFromTime:(input:TimeInvoiceInput)=>rpc<Invoice>('finance_draft_from_time',{p_input:parse(timeInvoiceSchema,input)}),
  issueInvoice:(workspace_id:string,invoice_id:string)=>rpc<Invoice>('finance_issue_invoice',scoped(workspace_id,invoice_id)),
  cancelInvoice:(workspace_id:string,invoice_id:string,reason:string)=>{if(typeof reason!=='string'||reason.trim().length<3||reason.length>2000)throw new FinanceError('validation');return rpc<Invoice>('finance_cancel_invoice',{...scoped(workspace_id,invoice_id),p_reason:reason.trim()})},
  recordPayment:(input:{workspace_id:string;invoice_id:string;paid_on:string;amount_minor:number;note:string})=>{const v=parse(paymentSchema,input);return rpc<Invoice>('finance_record_payment',{p_workspace_id:v.workspace_id,p_id:v.invoice_id,p_paid_on:v.paid_on,p_amount_minor:v.amount_minor,p_note:v.note})},
  deletePayment:(workspace_id:string,payment_id:string)=>rpc<Invoice>('finance_delete_payment',scoped(workspace_id,payment_id)),
  setInvoicePaid:(workspace_id:string,invoice_id:string,paid:boolean)=>{if(typeof paid!=='boolean')throw new FinanceError('validation');return rpc<Invoice>('finance_set_paid',{...scoped(workspace_id,invoice_id),p_paid:paid})},
  overview:async(workspace_id:string,from:string,to:string):Promise<FinanceOverview>=>{
   const w=id(workspace_id),range=parse(financeRangeSchema,{from,to});
   // Prognose, Restaufwand und Budgetverbrauch brauchen die GESAMTE Projekthistorie,
   // sonst zählt Arbeit vor dem gewählten Zeitraum doppelt in „verbleibend";
   // der Zeitraum liefert nur noch die Kennzahl „Istkosten im Zeitraum".
   const [plans,rates,expenses,entries,projects,workspace]=await Promise.all([
    service.listProjectPlans(w),service.listRates(w),service.listExpenses(w,'2000-01-01','2100-12-31'),
    readTimeEntryPages((start,end)=>client.from('time_entries').select('*',{count:'exact'}).eq('workspace_id',w).order('work_date').order('id').range(start,end),fail,code=>new FinanceError(code)),
    list<Project>(client.from('projects').select('*',{count:'exact'}).eq('workspace_id',w).order('id').limit(1001)),
    one<{currency:string}>(client.from('workspaces').select('currency').eq('id',w).single())
   ]);
   const inRange=(d:string)=>d>=range.from&&d<=range.to;
   const periodEntries=entries.filter(e=>inRange(e.work_date)),periodExpenses=expenses.filter(e=>inRange(e.expense_date));
   return {workspace_id:w,currency:workspace.currency,from:range.from,to:range.to,projects:projects.map(p=>{
    const plan=plans.find(x=>x.project_id===p.id)??{workspace_id:w,project_id:p.id,client_id:null,billing_mode:'hourly' as const,default_bill_rate_minor:null,fixed_fee_minor:0,planned_expenses_minor:0,lines:[],created_at:p.created_at};
    const period=projectFinancials(plan,periodEntries,rates,periodExpenses);
    return {...projectFinancials(plan,entries,rates,expenses),period_cost_minor:period.actual_cost_minor,period_minutes:period.actual_minutes};
   })};
  }
 };
 return service;
}
export type FinanceService=ReturnType<typeof createFinanceService>;
