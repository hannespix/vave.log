/** Financial amounts are integer minor units in the workspace currency. */
export type InvoiceLanguage = 'en'|'de'|'zh';
export type WorkerKind = 'employee'|'freelancer';
export type BillingMode = 'hourly'|'fixed'|'internal';
export interface FinanceClientInput { id?:string; workspace_id:string; name:string; billing_address:string; contact_email:string; tax_id:string; language:InvoiceLanguage }
export interface FinanceClient extends FinanceClientInput { id:string; created_at:string }
export interface BillingProfile { workspace_id:string; legal_name:string; billing_address:string; tax_id:string; payment_details:string; invoice_prefix:string; footer:string; logo_data?:string; payment_terms_days?:number }
export interface StaffRateInput { id?:string; workspace_id:string; user_id:string; kind:WorkerKind; effective_from:string; cost_rate_minor:number|null; bill_rate_minor:number|null }
export interface StaffRate extends StaffRateInput { id:string; created_at:string }
export interface EstimateLine { label:string; kind:WorkerKind; user_id:string|null; planned_minutes:number; cost_rate_minor:number|null; bill_rate_minor:number|null }
export interface ProjectPlanInput { workspace_id:string; project_id:string; client_id:string|null; billing_mode:BillingMode; default_bill_rate_minor:number|null; fixed_fee_minor:number; planned_expenses_minor:number; lines:EstimateLine[] }
export interface ProjectPlan extends ProjectPlanInput { created_at:string }
export interface ExpenseInput { id?:string; workspace_id:string; project_id:string; expense_date:string; description:string; amount_minor:number; category:'external'|'other'; not_time_costed:boolean }
export interface Expense extends ExpenseInput { id:string; created_at:string }
export interface InvoiceLineInput { description:string; quantity:number; unit_price_minor:number; tax_basis_points:number; zero_tax_reason:string; time_entry_id:string|null }
export interface InvoiceLine extends InvoiceLineInput { net_minor:number; tax_minor:number; total_minor:number; minutes?:number }
export interface InvoiceDraftInput { id?:string; workspace_id:string; client_id:string; project_id:string|null; language:InvoiceLanguage; issue_date:string; due_date:string; service_from:string; service_to:string; notes:string; payment_instructions:string; lines:InvoiceLineInput[] }
export interface Invoice extends Omit<InvoiceDraftInput,'id'|'lines'> { is_demo?:boolean; id:string; created_at:string; status:'draft'|'issued'|'cancellation'; number:string|null; currency:string; lines:InvoiceLine[]; net_minor:number; tax_minor:number; total_minor:number; issuer_snapshot:BillingProfile|null; customer_snapshot:FinanceClient|null; issued_at:string|null; cancellation_of:string|null; cancellation_reason:string; paid:boolean; cancellation_id:string|null }
export interface TimeInvoiceInput { workspace_id:string; project_id:string; client_id:string; from:string; to:string; language:InvoiceLanguage; issue_date:string; due_date:string; tax_basis_points:number; zero_tax_reason:string }
export interface ProjectFinancials { project_id:string; billing_mode:BillingMode; planned_minutes:number; actual_minutes:number; billable_minutes:number; remaining_minutes:number; planned_revenue_minor:number|null; planned_labor_cost_minor:number|null; planned_cost_minor:number|null; planned_margin_minor:number|null; actual_labor_cost_minor:number|null; actual_expenses_minor:number; actual_cost_minor:number|null; actual_billable_value_minor:number|null; forecast_cost_minor:number|null; forecast_margin_minor:number|null; missing_cost_entries:number; missing_bill_entries:number; missing_estimate_costs:number }
export interface FinanceOverview { workspace_id:string; currency:string; from:string; to:string; projects:ProjectFinancials[] }
