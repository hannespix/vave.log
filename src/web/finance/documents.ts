import type {
  BillingProfile,
  FinanceClient,
  FinanceOverview,
  Invoice,
  InvoiceLanguage,
} from "../../shared/finance-types";
import { ft } from "./catalog";
export const localeCode = (locale: InvoiceLanguage) =>
  ({ en: "en-GB", de: "de-DE", zh: "zh-CN" })[locale];
export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function decimalToMinor(value: string, currency: string): number {
  const clean = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(clean)) throw new Error("Invalid amount");
  const digits = currencyDigits(currency),
    negative = clean.startsWith("-"),
    [whole, fraction = ""] = clean.replace(/^-/, "").split(".");
  const padded = fraction.padEnd(digits + 1, "0");
  let minor =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(padded.slice(0, digits) || "0");
  if (Number(padded[digits]) >= 5) minor += 1n;
  const result = Number(negative ? -minor : minor);
  if (!Number.isSafeInteger(result)) throw new Error("Invalid amount");
  return result;
}
export function minorInput(
  value: number | null | undefined,
  currency: string,
): string {
  return value == null
    ? ""
    : (value / 10 ** currencyDigits(currency)).toFixed(
        currencyDigits(currency),
      );
}
export function money(
  value: number | null,
  currency: string,
  locale: InvoiceLanguage,
): string {
  return value === null
    ? ft(locale, "unknown")
    : new Intl.NumberFormat(localeCode(locale), {
        style: "currency",
        currency,
      }).format(value / 10 ** currencyDigits(currency));
}
export function displayDate(value: string, locale: InvoiceLanguage): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat(localeCode(locale), {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
const csv = (rows: unknown[][]) =>
  "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
export function invoiceCsv(invoice: Invoice): string {
  const t = (key: Parameters<typeof ft>[1]) => ft(invoice.language, key);
  return csv([
    [
      t("invoiceId"),
      t("number"),
      t("description"),
      t("quantity"),
      t("unitPrice"),
      t("taxRate"),
      t("net"),
      t("tax"),
      t("total"),
      t("currency"),
    ],
    ...invoice.lines.map((line) => [
      invoice.id,
      invoice.number || t("draftMark"),
      line.description,
      line.quantity,
      minorInput(line.unit_price_minor, invoice.currency),
      line.tax_basis_points / 100,
      minorInput(line.net_minor, invoice.currency),
      minorInput(line.tax_minor, invoice.currency),
      minorInput(line.total_minor, invoice.currency),
      invoice.currency,
    ]),
  ]);
}
export function overviewCsv(
  overview: FinanceOverview,
  projectNames: Map<string, string>,
  locale: InvoiceLanguage,
): string {
  const t = (key: Parameters<typeof ft>[1]) => ft(locale, key);
  return csv([
    [
      t("projectId"),
      t("project"),
      t("from"),
      t("to"),
      t("plannedRevenue"),
      t("plannedCost"),
      t("actualCost"),
      t("forecastCost"),
      t("forecastMargin"),
      t("currency"),
    ],
    ...overview.projects.map((p) => [
      p.project_id,
      projectNames.get(p.project_id) || p.project_id,
      overview.from,
      overview.to,
      minorInput(p.planned_revenue_minor, overview.currency),
      minorInput(p.planned_cost_minor, overview.currency),
      minorInput(p.actual_cost_minor, overview.currency),
      minorInput(p.forecast_cost_minor, overview.currency),
      minorInput(p.forecast_margin_minor, overview.currency),
      overview.currency,
    ]),
  ]);
}
/** Issued documents exclusively use frozen issuer/customer/line totals, never live records. */
export function invoiceHtml(
  invoice: Invoice,
  draftContext: {
    profile?: BillingProfile | null;
    customer?: FinanceClient | null;
  } = {},
): string {
  const { language: locale, currency } = invoice,
    t = (key: Parameters<typeof ft>[1]) => escapeHtml(ft(locale, key)),
    e = escapeHtml,
    m = (value: number) => e(money(value, currency, locale));
  const draft = invoice.status === "draft",
    issuer = draft ? draftContext.profile : invoice.issuer_snapshot,
    customer = draft ? draftContext.customer : invoice.customer_snapshot;
  const title = t(
    draft
      ? "draftMark"
      : invoice.status === "cancellation"
        ? "cancellation"
        : "invoice",
  );
  return `<!doctype html><html lang="${e(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} ${e(invoice.number || invoice.id)}</title><style>body{font:14px/1.55 system-ui,sans-serif;color:#202020;max-width:900px;margin:45px auto;padding:0 30px}h1{font-size:34px;margin:0}h2{font-size:17px}header{border-bottom:4px solid #641dff;padding-bottom:25px;margin-bottom:28px}small{color:#666}.parties,.dates{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:24px 0}.text{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;vertical-align:top;padding:12px 7px;border-bottom:1px solid #ddd}th{background:#f5f2ff}.amount{text-align:right;white-space:nowrap}.totals{margin:25px 0 25px auto;width:300px}.totals p{display:flex;justify-content:space-between}.total{font-size:20px;font-weight:700;border-top:2px solid #641dff;padding-top:12px}.draft{background:#e8ffb9;padding:12px;font-weight:800;letter-spacing:.08em}.note{font-size:11px;color:#666;margin-top:30px}footer{border-top:1px solid #ddd;margin-top:25px;padding-top:18px}@page{size:A4;margin:18mm}@media print{body{margin:0;padding:0}thead{display:table-header-group}tr{break-inside:avoid}.totals{break-inside:avoid}}</style></head><body><header>${draft ? `<p class="draft">${t("draftMark")}</p>` : ""}<h1>${title}</h1><p>${e(invoice.number || invoice.id)}</p><small>${t("invoiceId")}: ${e(invoice.id)}</small></header><div class="parties"><section><h2>${e(issuer?.legal_name || "")}</h2><div class="text">${e(issuer?.billing_address || "")}</div><p>${t("taxId")}: ${e(issuer?.tax_id || "")}</p></section><section><h2>${e(customer?.name || "")}</h2><div class="text">${e(customer?.billing_address || "")}</div><p>${t("taxId")}: ${e(customer?.tax_id || "")}</p></section></div><div class="dates"><div>${t("issueDate")}: ${e(displayDate(invoice.issue_date, locale))}<br>${t("dueDate")}: ${e(displayDate(invoice.due_date, locale))}</div><div>${t("serviceFrom")}: ${e(displayDate(invoice.service_from, locale))}<br>${t("serviceTo")}: ${e(displayDate(invoice.service_to, locale))}</div></div>${invoice.cancellation_of ? `<p>${t("original")}: ${e(invoice.cancellation_of)}</p><p class="text">${e(invoice.cancellation_reason)}</p>` : ""}<table><thead><tr><th>${t("description")}</th><th class="amount">${t("quantity")}</th><th class="amount">${t("unitPrice")}</th><th class="amount">${t("taxRate")}</th><th class="amount">${t("net")}</th></tr></thead><tbody>${invoice.lines.map((line) => `<tr><td class="text">${e(line.description)}${line.zero_tax_reason ? `<br><small>${e(line.zero_tax_reason)}</small>` : ""}</td><td class="amount">${e(new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 4 }).format(line.quantity))}</td><td class="amount">${m(line.unit_price_minor)}</td><td class="amount">${e(new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 2 }).format(line.tax_basis_points / 100))} %</td><td class="amount">${m(line.net_minor)}</td></tr>`).join("")}</tbody></table><div class="totals"><p><span>${t("net")}</span><span>${m(invoice.net_minor)}</span></p><p><span>${t("tax")}</span><span>${m(invoice.tax_minor)}</span></p><p class="total"><span>${t("total")}</span><span>${m(invoice.total_minor)}</span></p></div><h2>${t("payment")}</h2><p class="text">${e(invoice.payment_instructions || issuer?.payment_details || "")}</p><p class="text">${e(invoice.notes)}</p><p class="note">${t("pdfNote")}</p><footer class="text">${e(issuer?.footer || "")}</footer></body></html>`;
}
export function downloadText(
  filename: string,
  value: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printInvoice(
  invoice: Invoice,
  context: Parameters<typeof invoiceHtml>[1],
) {
  const frame = document.createElement("iframe");
  frame.title = ft(invoice.language, "invoice");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;left:-10000px;border:0";
  frame.srcdoc = invoiceHtml(invoice, context);
  frame.onload = () => {
    frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), {
      once: true,
    });
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  document.body.appendChild(frame);
}
