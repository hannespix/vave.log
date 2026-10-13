import type { Expense,InvoiceLineInput,ProjectFinancials,ProjectPlan,StaffRate } from './finance-types.js';
import type { TimeEntry } from './types.js';
function safe(n:number):bigint {if(!Number.isSafeInteger(n))throw new Error('A safe integer is required.');return BigInt(n)}
function rounded(n:bigint,d:bigint):number {if(d<=0n)throw new Error('A positive denominator is required.');const sign=n<0n?-1n:1n;const magnitude=n<0n?-n:n;const value=sign*((magnitude+d/2n)/d);const out=Number(value);if(!Number.isSafeInteger(out))throw new Error('Amount exceeds the supported range.');return out}
/** PostgreSQL numeric round: half away from zero, including negative corrections. */
export function roundRatio(numerator:number,denominator:number):number{return rounded(safe(numerator),safe(denominator))}
export function hourlyAmount(minutes:number,rate_minor:number):number{return rounded(safe(minutes)*safe(rate_minor),60n)}
export function lineTotals(line:InvoiceLineInput):{net_minor:number;tax_minor:number;total_minor:number}{
 const scaled=Math.round(line.quantity*10000);
 if(!Number.isFinite(line.quantity)||Math.abs(line.quantity*10000-scaled)>0.00001)throw new Error('Use at most four decimal places.');
 const net_minor=rounded(safe(scaled)*safe(line.unit_price_minor),10000n),tax_minor=rounded(safe(net_minor)*safe(line.tax_basis_points),10000n);
 const total_minor=net_minor+tax_minor;if(!Number.isSafeInteger(total_minor))throw new Error('Amount exceeds the supported range.');return {net_minor,tax_minor,total_minor};
}
export function salaryHourlyCost(annual_cost_minor:number,annual_productive_hours:number):number {if(annual_cost_minor<0||annual_productive_hours<=0||!Number.isFinite(annual_productive_hours))throw new Error('Enter positive productive hours and a nonnegative annual cost.');return rounded(safe(annual_cost_minor)*10000n,safe(Math.round(annual_productive_hours*10000)))}
export function effectiveRate(rates:StaffRate[],user_id:string,date:string):StaffRate|undefined {return rates.filter(r=>r.user_id===user_id&&r.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]}
export function projectFinancials(plan:ProjectPlan,allEntries:TimeEntry[],allRates:StaffRate[],allExpenses:Expense[]):ProjectFinancials {
 const entries=allEntries.filter(e=>e.workspace_id===plan.workspace_id&&e.project_id===plan.project_id),rates=allRates.filter(r=>r.workspace_id===plan.workspace_id),expenses=allExpenses.filter(e=>e.workspace_id===plan.workspace_id&&e.project_id===plan.project_id);
 const planned_minutes=plan.lines.reduce((s,l)=>s+l.planned_minutes,0),actual_minutes=entries.reduce((s,e)=>s+e.minutes,0),billable_minutes=entries.filter(e=>e.billable).reduce((s,e)=>s+e.minutes,0),remaining_minutes=Math.max(0,planned_minutes-actual_minutes);
 let missing_estimate_costs=0,missing_cost_entries=0,missing_bill_entries=0,plannedLabor=0,plannedRevenue=0,unknownRevenue=false,labor=0,value=0;
 for(const l of plan.lines){if(l.planned_minutes>0&&l.cost_rate_minor===null)missing_estimate_costs++;else plannedLabor+=hourlyAmount(l.planned_minutes,l.cost_rate_minor??0);const bill=l.bill_rate_minor??plan.default_bill_rate_minor;if(bill===null&&l.planned_minutes>0)unknownRevenue=true;else plannedRevenue+=hourlyAmount(l.planned_minutes,bill??0)}
 for(const e of entries){const r=effectiveRate(rates,e.user_id,e.work_date);if(r?.cost_rate_minor==null)missing_cost_entries++;else labor+=hourlyAmount(e.minutes,r.cost_rate_minor);if(e.billable&&plan.billing_mode!=='internal'){const bill=r?.bill_rate_minor??plan.default_bill_rate_minor;if(bill===null)missing_bill_entries++;else value+=hourlyAmount(e.minutes,bill)}}
 const planned_labor_cost_minor=missing_estimate_costs?null:plannedLabor,planned_cost_minor=planned_labor_cost_minor===null?null:plannedLabor+plan.planned_expenses_minor;
 const planned_revenue_minor=plan.billing_mode==='internal'?0:plan.billing_mode==='fixed'?plan.fixed_fee_minor:unknownRevenue?null:plannedRevenue;
 const actual_labor_cost_minor=missing_cost_entries?null:labor,actual_expenses_minor=expenses.reduce((s,e)=>s+e.amount_minor,0),actual_cost_minor=actual_labor_cost_minor===null?null:labor+actual_expenses_minor;
 const remainingLabor=remaining_minutes===0?0:planned_labor_cost_minor===null?null:rounded(safe(plannedLabor)*safe(remaining_minutes),safe(planned_minutes));
 const forecast_cost_minor=actual_cost_minor===null||remainingLabor===null?null:actual_cost_minor+remainingLabor+Math.max(0,plan.planned_expenses_minor-actual_expenses_minor);
 const result:ProjectFinancials={project_id:plan.project_id,billing_mode:plan.billing_mode,planned_minutes,actual_minutes,billable_minutes,remaining_minutes,planned_revenue_minor,planned_labor_cost_minor,planned_cost_minor,planned_margin_minor:planned_cost_minor===null||planned_revenue_minor===null?null:planned_revenue_minor-planned_cost_minor,actual_labor_cost_minor,actual_expenses_minor,actual_cost_minor,actual_billable_value_minor:missing_bill_entries?null:value,forecast_cost_minor,forecast_margin_minor:forecast_cost_minor===null||planned_revenue_minor===null?null:planned_revenue_minor-forecast_cost_minor,missing_cost_entries,missing_bill_entries,missing_estimate_costs};
 for(const value of Object.values(result))if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Amount exceeds the supported range.');
 return result;
}
