import type { Invoice } from "../../shared/finance-types";

/** Invoice issue-period totals; paid/open are current status, not cash flow. */
export function summarizeInvoices(
  invoices: readonly Invoice[],
  range: { from: string; to: string },
  projectId = "",
) {
  const totals = { invoicedNet: 0, paidNet: 0, openNet: 0 };
  for (const invoice of invoices) {
    if (
      invoice.status === "draft" ||
      (projectId && invoice.project_id !== projectId) ||
      invoice.issue_date < range.from ||
      invoice.issue_date > range.to
    ) continue;
    totals.invoicedNet += invoice.net_minor;
    if (invoice.status === "issued" && !invoice.cancellation_id) {
      if (invoice.paid) totals.paidNet += invoice.net_minor;
      else totals.openNet += invoice.net_minor;
    }
  }
  return totals;
}
