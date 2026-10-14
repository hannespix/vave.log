import { createClient } from '@supabase/supabase-js';
import { it,expect } from 'vitest';
import { createFinanceService } from '../src/shared/finance-service';
const w='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
function service(fetcher:(url:URL,init:RequestInit)=>Response){return createFinanceService(createClient('https://example.supabase.co','test',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>fetcher(new URL(String(url)),init??{})}}))}
it('rejects control-field injection before issuing any API request',async()=>{let calls=0;const s=service(()=>{calls++;return new Response('{}')});await expect(async()=>s.saveInvoiceDraft({workspace_id:w,client_id:id,project_id:null,language:'en',issue_date:'2026-10-13',due_date:'2026-10-13',service_from:'2026-10-13',service_to:'2026-10-13',notes:'',payment_instructions:'',lines:[],status:'issued'} as never)).rejects.toMatchObject({code:'validation'});expect(calls).toBe(0)});
it('issues via the scoped RPC and never sends client totals',async()=>{let request:{path:string;body:any}|undefined;const s=service((url,init)=>{request={path:url.pathname,body:JSON.parse(String(init.body))};return new Response(JSON.stringify({id,workspace_id:w,status:'issued'}),{status:200,headers:{'content-type':'application/json'}})});expect((await s.issueInvoice(w,id)).id).toBe(id);expect(request).toEqual({path:'/rest/v1/rpc/finance_issue_invoice',body:{p_workspace_id:w,p_id:id}})});
it('maps SQL errors into controlled English without SQL details',async()=>{const s=service(()=>new Response(JSON.stringify({code:'P0001',message:'FINANCE_CONFLICT',details:'secret SQL relation'}),{status:400,headers:{'content-type':'application/json'}}));await expect(s.issueInvoice(w,id)).rejects.toMatchObject({code:'conflict',message:'This financial record changed or is already in use.'})});
it('bases forecast and actuals on the full project history while period costs follow the range',async()=>{
 const p='00000000-0000-4000-8000-000000000003',u='00000000-0000-4000-8000-000000000004';
 const entry=(eid:string,date:string)=>({id:eid,workspace_id:w,project_id:p,user_id:u,work_date:date,minutes:60,note:'',billable:true,status:'approved'});
 let entryQuery='',expenseQuery='';
 const s=service(url=>{
  const json=(body:unknown,range:string)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json','content-range':range}});
  if(url.pathname.endsWith('/time_entries')){entryQuery=url.search;return json([entry('e1','2026-10-05'),entry('e2','2026-09-01')],'0-1/2')}
  if(url.pathname.endsWith('/finance_staff_rates'))return json([{id:'r1',workspace_id:w,user_id:u,kind:'employee',effective_from:'2026-01-01',cost_rate_minor:6000,bill_rate_minor:null,created_at:''}],'0-0/1');
  if(url.pathname.endsWith('/finance_expenses')){expenseQuery=url.search;return json([],'*/0')}
  if(url.pathname.endsWith('/projects'))return json([{id:p,workspace_id:w,code:'A',name:'A',status:'active',created_at:'2026-01-01'}],'0-0/1');
  if(url.pathname.endsWith('/workspaces'))return json({currency:'EUR'},'0-0/1');
  return json([],'*/0');
 });
 const o=await s.overview(w,'2026-10-01','2026-10-31');
 expect(entryQuery).not.toContain('work_date=gte');
 expect(expenseQuery).toContain('expense_date=gte.2000-01-01');
 const row=o.projects[0]!;
 expect(row.actual_minutes).toBe(120);
 expect(row.actual_cost_minor).toBe(12000);
 expect(row.forecast_cost_minor).toBe(12000);
 expect(row.period_minutes).toBe(60);
 expect(row.period_cost_minor).toBe(6000);
});
it('rejects truncated financial lists and scopes reads to workspace',async()=>{let seen='';const s=service(url=>{seen=url.search;return new Response('[]',{status:200,headers:{'content-type':'application/json','content-range':'0-999/1001'}})});await expect(s.listClients(w)).rejects.toMatchObject({code:'result_limit'});expect(seen).toContain('workspace_id=eq.'+w);expect(seen).toContain('limit=1001')});
