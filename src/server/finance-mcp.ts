import {z} from 'zod';
import type {FinanceService} from '../shared/finance-service.js';
import {financeUuid as uuid,financeDate as date,clientSchema,billingProfileSchema,staffRateSchema,projectPlanSchema,expenseSchema,invoiceDraftSchema,timeInvoiceSchema} from '../shared/finance-validation.js';
export type ToolRegistrar=(name:string,description:string,schema:z.ZodRawShape,readOnly:boolean,action:(args:any)=>Promise<unknown>,destructive?:boolean,idempotent?:boolean)=>void;

/** Financial tools share the GUI's user-scoped client; PostgreSQL enforces roles. */
export function registerFinanceTools(tool:ToolRegistrar,service:FinanceService){
 const workspace={workspace_id:uuid};const document={...workspace,id:uuid};
 tool('finance_list_clients','Manager/owner: list clients and billing details. At most 1,000 records.',workspace,true,a=>service.listClients(a.workspace_id));
 tool('finance_save_client','Manager/owner: save a client. Confirm billing details; use a stable id for retries. language selects invoice language.',clientSchema.shape,false,a=>service.saveClient(a));
 tool('finance_get_profile','Manager/owner: read the company billing identity.',workspace,true,a=>service.getProfile(a.workspace_id));
 tool('finance_save_profile','Owner only: save legal billing identity and payment instructions. Confirm exact legal and banking details first.',billingProfileSchema.shape,false,a=>service.saveProfile(a),false,true);
 tool('finance_list_rates','Manager/owner: read effective-dated staff cost and billing rates in workspace currency minor units per hour.',workspace,true,a=>service.listRates(a.workspace_id));
 tool('finance_save_rate','Manager/owner: save an effective-dated employee/freelancer rate. Null means unknown, never zero. Confirm person/date/amounts; use stable id.',staffRateSchema.shape,false,a=>service.saveRate(a));
 tool('finance_list_plans','Manager/owner: list project budgets and generic/person-specific effort estimates.',workspace,true,a=>service.listProjectPlans(a.workspace_id));
 tool('finance_get_plan','Manager/owner: read one project commercial plan.',{...workspace,project_id:uuid},true,a=>service.getProjectPlan(a.workspace_id,a.project_id));
 tool('finance_save_plan','Manager/owner: save project planning. Effort is minutes, money is integer currency minor units. Confirm estimates first; unknown rates stay null.',projectPlanSchema.shape,false,a=>service.saveProjectPlan(a),false,true);
 tool('finance_list_expenses','Manager/owner: list external expenses in an inclusive date range. At most 1,000 records.',{...workspace,from:date,to:date},true,a=>service.listExpenses(a.workspace_id,a.from,a.to));
 tool('finance_save_expense','Manager/owner: save external cost. not_time_costed must be true: confirm this does not duplicate a time-costed freelancer charge. Use stable id.',expenseSchema.shape,false,a=>service.saveExpense(a));
 tool('finance_delete_expense','Manager/owner: permanently delete an expense. Confirm its exact identity and amount first.',document,false,a=>service.deleteExpense(a.workspace_id,a.id),true);
 tool('finance_overview','Manager/owner: project planned costs, full-project actuals and forecast, plus period_cost_minor/period_minutes for the date range. Unknown rates return null/incomplete counters; contribution excludes unconfigured overhead.',{...workspace,from:date,to:date},true,a=>service.overview(a.workspace_id,a.from,a.to));
 tool('finance_list_invoices','Manager/owner: list drafts, immutable issued invoices and linked cancellations. At most 1,000.',workspace,true,a=>service.listInvoices(a.workspace_id));
 tool('finance_get_invoice','Manager/owner: read an invoice and frozen snapshots if issued.',document,true,a=>service.getInvoice(a.workspace_id,a.id));
 tool('finance_save_draft','Manager/owner: save an unnumbered draft only. Confirm dates/customer/line amounts; stable id recommended. No email is sent. language is the document language, independent of response_locale.',invoiceDraftSchema.shape,false,a=>service.saveInvoiceDraft(a));
 tool('finance_draft_from_time','Manager/owner: prepare a draft from approved billable unclaimed time. Review dates, customer, effective billing rates and tax treatment first. Does not issue or send.',timeInvoiceSchema.shape,false,a=>service.draftFromTime(a));
 tool('finance_issue_invoice','Manager/owner: FINALIZE and allocate an invoice number, freezing all snapshots. Explicitly confirm the reviewed draft, issuer/customer, tax, dates and totals. Idempotent retry; cannot edit or delete afterward. Marked demo workspaces produce permanent DEMO sample documents, never payable real invoices. No email is sent. PDF is not a structured e-invoice.',document,false,a=>service.issueInvoice(a.workspace_id,a.id),true,true);
 tool('finance_cancel_invoice','Manager/owner: create a linked immutable full negative correction with its own number. Confirm the original number and cancellation reason first. Preserves original and time claims; retry returns same correction.',{...document,reason:z.string().trim().min(3).max(2000)},false,a=>service.cancelInvoice(a.workspace_id,a.id,a.reason),true,true);
 tool('finance_set_paid','Manager/owner: record paid/unpaid status without changing the immutable invoice. Confirm actual payment evidence first; does not move money.',{...document,paid:z.boolean()},false,a=>service.setInvoicePaid(a.workspace_id,a.id,a.paid),false,true);
 tool('finance_record_payment','Manager/owner: record a (partial) payment with date, amount in currency minor units and note on an issued invoice. The invoice is marked paid once recorded payments cover the gross total. Confirm actual payment evidence first; does not move money.',{...document,paid_on:date,amount_minor:z.number().int().min(1).max(9_000_000_000_000),note:z.string().max(500)},false,a=>service.recordPayment({workspace_id:a.workspace_id,invoice_id:a.id,paid_on:a.paid_on,amount_minor:a.amount_minor,note:a.note}));
 tool('finance_delete_payment','Manager/owner: permanently delete one recorded payment by its id and recompute the paid status. Confirm its exact date and amount first.',document,false,a=>service.deletePayment(a.workspace_id,a.id),true);
}
