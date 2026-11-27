import {z} from 'zod';
import type {FinanceService} from '../shared/finance-service.js';
import {financeUuid as uuid,financeDate as date,clientSchema,billingProfileSchema,staffRateSchema,projectPlanSchema,expenseSchema,invoiceDraftSchema,timeInvoiceSchema} from '../shared/finance-validation.js';
export type ToolRegistrar=(name:string,description:string,schema:z.ZodRawShape,readOnly:boolean,action:(args:any)=>Promise<unknown>,destructive?:boolean,idempotent?:boolean)=>void;

/** Financial tools share the GUI's user-scoped client; PostgreSQL enforces roles. */
export function registerFinanceTools(tool:ToolRegistrar,service:FinanceService){
 const workspace={workspace_id:uuid};const document={...workspace,id:uuid};
 const invoiceCursor=z.strictObject({created_at:z.iso.datetime({offset:true}),id:uuid});
 tool('finance_list_clients','Finance view: list clients and billing details. At most 1,000 records.',workspace,true,a=>service.listClients(a.workspace_id));
 tool('finance_save_client','Finance edit: save a client. Confirm billing details; use a stable id for retries. language selects invoice language.',clientSchema.shape,false,a=>service.saveClient(a));
 tool('finance_get_profile','Finance view: read the company billing identity.',workspace,true,a=>service.getProfile(a.workspace_id));
 tool('finance_save_profile','Owner only: save legal billing identity and payment instructions. Confirm exact legal and banking details first.',billingProfileSchema.shape,false,a=>service.saveProfile(a),false,true);
 tool('finance_list_rates','Finance view: read effective-dated staff cost and billing rates in workspace currency minor units per hour.',workspace,true,a=>service.listRates(a.workspace_id));
 tool('finance_save_rate','Finance edit: save an effective-dated employee/freelancer rate. Null means unknown, never zero. Confirm person/date/amounts; use stable id.',staffRateSchema.shape,false,a=>service.saveRate(a));
 tool('finance_list_plans','Finance view: list project budgets and generic/person-specific effort estimates.',workspace,true,a=>service.listProjectPlans(a.workspace_id));
 tool('finance_get_plan','Finance view: read one project commercial plan.',{...workspace,project_id:uuid},true,a=>service.getProjectPlan(a.workspace_id,a.project_id));
 tool('finance_save_plan','Finance edit: save project planning. Effort is minutes, money is integer currency minor units. Confirm estimates first; unknown rates stay null.',projectPlanSchema.shape,false,a=>service.saveProjectPlan(a),false,true);
 tool('finance_list_expenses','Finance view: list external expenses in an inclusive date range. At most 1,000 records.',{...workspace,from:date,to:date},true,a=>service.listExpenses(a.workspace_id,a.from,a.to));
 tool('finance_save_expense','Finance edit: save external cost. not_time_costed must be true: confirm this does not duplicate a time-costed freelancer charge. Use stable id.',expenseSchema.shape,false,a=>service.saveExpense(a));
 tool('finance_delete_expense','Finance edit: permanently delete an expense. Confirm its exact identity and amount first.',document,false,a=>service.deleteExpense(a.workspace_id,a.id),true);
 tool('finance_overview','Finance view: project planned costs, full-project actuals and forecast, plus period_cost_minor/period_minutes for the date range. Unknown rates return null/incomplete counters; contribution excludes unconfigured overhead.',{...workspace,from:date,to:date},true,a=>service.overview(a.workspace_id,a.from,a.to));
 tool('finance_list_invoices','Finance view: list up to 100 drafts, issued invoices and cancellations per page, newest first. To continue, pass the last result’s created_at and id as before.',{...workspace,before:invoiceCursor.optional()},true,a=>service.listInvoicePage(a.workspace_id,a.before));
 tool('finance_get_invoice','Finance view: read an invoice and frozen snapshots if issued.',document,true,a=>service.getInvoice(a.workspace_id,a.id));
 tool('finance_save_draft','Finance edit: save an unnumbered draft only. Confirm dates/customer/line amounts; stable id recommended. No email is sent. language is the document language, independent of response_locale.',invoiceDraftSchema.shape,false,a=>service.saveInvoiceDraft(a));
 tool('finance_draft_from_time','Finance edit: prepare a draft from approved billable unclaimed time. Review dates, customer, effective billing rates and tax treatment first. Does not issue or send.',timeInvoiceSchema.shape,false,a=>service.draftFromTime(a));
 tool('finance_issue_invoice','Finance edit: finalize and number the invoice after rechecking any source time and recomputing totals. Review the draft, issuer, customer, tax, dates and totals first. An issued invoice is immutable and retries return the same invoice. Marked demo workspaces produce permanent DEMO sample documents. Issuance sends no email.',document,false,a=>service.issueInvoice(a.workspace_id,a.id),true,true);
 tool('finance_cancel_invoice','Finance edit: create a linked immutable full negative correction with its own number. The original is preserved and its time entries become available for billing again. Review the original and the reason first. Retrying returns the same correction.',{...document,reason:z.string().trim().min(3).max(2000)},false,a=>service.cancelInvoice(a.workspace_id,a.id,a.reason),true,true);
 tool('finance_set_paid','Finance edit: record paid/unpaid status without changing the immutable invoice. Confirm actual payment evidence first; does not move money.',{...document,paid:z.boolean()},false,a=>service.setInvoicePaid(a.workspace_id,a.id,a.paid),false,true);
 tool('finance_record_payment','Finance edit: record a payment on an issued invoice. The recorded amount counts toward the paid status. Confirm payment evidence and use one operation_id for that payment, including retries with the same arguments.',{...document,paid_on:date,amount_minor:z.number().int().min(1).max(9_000_000_000_000),note:z.string().max(500),operation_id:uuid},false,a=>service.recordPayment({workspace_id:a.workspace_id,invoice_id:a.id,paid_on:a.paid_on,amount_minor:a.amount_minor,note:a.note,operation_id:a.operation_id}),false,true);
 tool('finance_delete_payment','Finance edit: permanently delete one recorded payment by its id and recompute the paid status. Confirm its exact date and amount first.',document,false,a=>service.deletePayment(a.workspace_id,a.id),true);
}
