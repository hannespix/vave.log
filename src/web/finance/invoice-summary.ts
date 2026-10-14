import type { Invoice } from "../../shared/finance-types";
import { fold } from "../helpers";

/** Multitoken-UND-Suche (diakritikatolerant) über Nummer, Kunde, Kennung und Notizen. */
export function invoiceMatchesQuery(
  invoice: Invoice,
  clientName: string,
  query: string,
): boolean {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = fold(
    `${invoice.number || ""} ${clientName} ${invoice.id} ${invoice.notes}`,
  );
  return tokens.every((token) => haystack.includes(token));
}

/** Ausgestellt, unbezahlt, Zahlungsziel überschritten, nicht storniert. */
export function isOverdue(invoice: Invoice, today: string): boolean {
  return (
    invoice.status === "issued" &&
    !invoice.paid &&
    !invoice.cancellation_id &&
    invoice.due_date < today
  );
}

/** Invoice issue-period totals; paid/open are current status, not cash flow. */
export function summarizeInvoices(
  invoices: readonly Invoice[],
  range: { from: string; to: string },
  projectId = "",
  today = "",
) {
  const totals = { invoicedNet: 0, paidNet: 0, openNet: 0, overdueNet: 0, overdueCount: 0 };
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
      else {
        totals.openNet += invoice.net_minor;
        if (today && isOverdue(invoice, today)) {
          totals.overdueNet += invoice.net_minor;
          totals.overdueCount++;
        }
      }
    }
  }
  return totals;
}
