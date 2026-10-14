import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FinanceArea } from "../src/web/finance";
import { financeError, ft } from "../src/web/finance/catalog";
import { FinanceContext, type FinanceContextValue } from "../src/web/finance/context";
import { Overview } from "../src/web/finance/overview";
import { Planning } from "../src/web/finance/planning";
import { DraftEditor, Invoices, TimeDraft } from "../src/web/finance/invoices";
import { isOverdue, summarizeInvoices } from "../src/web/finance/invoice-summary";
import { describe, expect, it } from "vitest";
import {
  currencyDigits,
  decimalToMinor,
  money,
  invoiceHtml,
  invoiceCsv,
  taxBreakdown,
} from "../src/web/finance/documents";
import type {
  Invoice,
  BillingProfile,
  FinanceClient,
} from "../src/shared/finance-types";
const issuer: BillingProfile = {
  workspace_id: "w",
  legal_name: "Issuer <script>bad()</script>",
  billing_address: "Main street",
  tax_id: "TX",
  payment_details: "Pay here",
  invoice_prefix: "INV",
  footer: "Thank you",
};
const customer: FinanceClient = {
  id: "c",
  workspace_id: "w",
  created_at: "",
  name: "Frozen customer",
  billing_address: "Customer street",
  tax_id: "CT",
  contact_email: "a@example.test",
  language: "en",
};
const invoice: Invoice = {
  id: "stable-invoice-id",
  workspace_id: "w",
  client_id: "c",
  project_id: null,
  created_at: "",
  language: "de",
  issue_date: "2026-10-13",
  due_date: "2026-11-13",
  service_from: "2026-10-01",
  service_to: "2026-10-13",
  notes: "<img src=x onerror=alert(1)>",
  payment_instructions: "Pay",
  status: "issued",
  number: "INV-0001",
  currency: "EUR",
  lines: [
    {
      description: '=HYPERLINK("bad")',
      quantity: 1,
      unit_price_minor: 10050,
      tax_basis_points: 1900,
      zero_tax_reason: "",
      time_entry_id: null,
      net_minor: 10050,
      tax_minor: 1910,
      total_minor: 11960,
    },
  ],
  net_minor: 10050,
  tax_minor: 1910,
  total_minor: 11960,
  issuer_snapshot: issuer,
  customer_snapshot: customer,
  issued_at: "2026-10-13",
  cancellation_of: null,
  cancellation_reason: "",
  paid: false,
  cancellation_id: null,
};
describe("finance documents", () => {
  it.each([
    ["en", "DEMO — Not for payment"],
    ["de", "DEMO — Nicht zur Zahlung"],
    ["zh", "DEMO — 示例，请勿付款"],
  ] as const)("marks saved sample documents and exports in %s", (language, notice) => {
    for (const status of ["draft", "issued", "cancellation"] as const) {
      const sample = { ...invoice, language, status, is_demo: true };
      const html = invoiceHtml(sample);
      expect(html).toContain(`<p class="demo-notice">${notice}</p>`);
      expect(html).toContain(`class="demo-watermark"`);
      expect(invoiceCsv(sample)).toContain(notice);
      expect(invoiceHtml(sample, { isDemo: false })).toContain(notice);
      expect(invoiceCsv(sample, { isDemo: false })).toContain(notice);
      expect(html).toContain("119");
    }
  });
  it("itemizes tax per rate on the document and keeps the breakdown stable (§ 14 UStG)", () => {
    const lines = [
      { description: "Design", quantity: 1, unit_price_minor: 10000, tax_basis_points: 1900, zero_tax_reason: "", time_entry_id: null, net_minor: 10000, tax_minor: 1900, total_minor: 11900 },
      { description: "Buch", quantity: 1, unit_price_minor: 5000, tax_basis_points: 700, zero_tax_reason: "", time_entry_id: null, net_minor: 5000, tax_minor: 350, total_minor: 5350 },
      { description: "Export", quantity: 1, unit_price_minor: 2000, tax_basis_points: 0, zero_tax_reason: "Reverse charge", time_entry_id: null, net_minor: 2000, tax_minor: 0, total_minor: 2000 },
      { description: "Design 2", quantity: 1, unit_price_minor: 3000, tax_basis_points: 1900, zero_tax_reason: "", time_entry_id: null, net_minor: 3000, tax_minor: 570, total_minor: 3570 },
    ];
    expect(taxBreakdown(lines)).toEqual([
      { basisPoints: 0, net_minor: 2000, tax_minor: 0 },
      { basisPoints: 700, net_minor: 5000, tax_minor: 350 },
      { basisPoints: 1900, net_minor: 13000, tax_minor: 2470 },
    ]);
    const multi = { ...invoice, lines, net_minor: 20000, tax_minor: 2820, total_minor: 22820 } as Invoice;
    const html = invoiceHtml(multi);
    expect(html).toContain("Steuer 19&nbsp;% <small>(130,00\u00a0€)</small></span><span>24,70\u00a0€</span>");
    expect(html).toContain("Steuer 7&nbsp;% <small>(50,00\u00a0€)</small></span><span>3,50\u00a0€</span>");
    expect(html).toContain("Steuer 0&nbsp;% <small>(20,00\u00a0€)</small></span><span>0,00\u00a0€</span>");
  });
  it("prints only safe frozen raster logos in the letterhead", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const html = invoiceHtml({ ...invoice, issuer_snapshot: { ...issuer, logo_data: logo } });
    expect(html).toContain(`<img class="logo" src="${logo}"`);
    expect(invoiceHtml(invoice)).not.toContain('class="logo"');
    for (const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "https://example.test/logo.png",
      'data:image/png;base64,abc" onerror="x',
    ])
      expect(
        invoiceHtml({ ...invoice, issuer_snapshot: { ...issuer, logo_data: bad } }),
      ).not.toContain('class="logo"');
    const draft = invoiceHtml(
      { ...invoice, status: "draft", number: null, issuer_snapshot: null, customer_snapshot: null },
      { profile: { ...issuer, logo_data: logo }, customer },
    );
    expect(draft).toContain('<img class="logo"');
  });
  it("marks draft previews from the workspace while issued documents use the durable flag only", () => {
    const draft = { ...invoice, status: "draft" as const };
    expect(invoiceHtml(draft, { isDemo: true })).toContain("DEMO — Nicht zur Zahlung");
    expect(invoiceCsv(draft, { isDemo: true })).toContain("DEMO — Nicht zur Zahlung");
    expect(invoiceHtml(invoice, { isDemo: true })).toBe(invoiceHtml(invoice));
    expect(invoiceCsv(invoice, { isDemo: true })).toBe(invoiceCsv(invoice));
  });
  it("leaves ordinary and legacy invoices free of sample markings", () => {
    const real = { ...invoice, is_demo: false };
    expect(invoiceHtml(real)).toBe(invoiceHtml(invoice));
    expect(invoiceCsv(real)).toBe(invoiceCsv(invoice));
    expect(invoiceHtml(real)).not.toContain("DEMO");
    expect(invoiceCsv(real)).not.toContain("DEMO");
    expect(invoiceCsv(real).split("\r\n")).toHaveLength(2);
  });
  it("honors currency precision and decimal rounding in either direction", () => {
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
    expect(decimalToMinor("1.005", "EUR")).toBe(101);
    expect(decimalToMinor("-1.005", "EUR")).toBe(-101);
    expect(decimalToMinor("1.2345", "KWD")).toBe(1235);
    expect(decimalToMinor("12.5", "JPY")).toBe(13);
    expect(money(1234, "JPY", "en")).toContain("1,234");
  });
  it("uses frozen snapshots and document language, escapes every user value", () => {
    const html = invoiceHtml(invoice, {
      profile: { ...issuer, legal_name: "CHANGED" },
      customer: { ...customer, name: "CHANGED" },
    });
    expect(html).toContain('lang="de"');
    expect(html).toContain("Rechnung");
    expect(html).toContain("Frozen customer");
    expect(html).not.toContain("CHANGED");
    expect(html).not.toContain("<script>bad()");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("119,60");
  });
  it("marks unnumbered drafts and linked cancellations clearly", () => {
    expect(
      invoiceHtml({
        ...invoice,
        status: "draft",
        number: null,
        issuer_snapshot: null,
        customer_snapshot: null,
      }),
    ).toContain("ENTWURF");
    const html = invoiceHtml({
      ...invoice,
      status: "cancellation",
      cancellation_of: "original-id",
      cancellation_reason: "Correction",
    });
    expect(html).toContain("Stornorechnung");
    expect(html).toContain("original-id");
    expect(html).not.toContain("Gutschrift");
  });
  it("neutralizes formulas and preserves stable IDs in a localized CSV", () => {
    const csv = invoiceCsv(invoice);
    expect(csv).toContain("stable-invoice-id");
    expect(csv).toContain("Beschreibung");
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain("EUR");
  });
});

describe("finance export edge cases", () => {
  it("renders all interface languages without translating source content", () => {
    for (const [language, label] of [
      ["en", "Invoice"],
      ["de", "Rechnung"],
      ["zh", "发票"],
    ] as const) {
      const html = invoiceHtml({ ...invoice, language });
      expect(html).toContain(label);
      expect(html).toContain("Frozen customer");
      expect(html).toContain("Issuer &lt;script&gt;");
    }
  });
  it("preserves negative cancellation totals at workspace currency precision", () => {
    const html = invoiceHtml({
      ...invoice,
      language: "en",
      status: "cancellation",
      currency: "JPY",
      total_minor: -11960,
      net_minor: -10050,
      tax_minor: -1910,
      cancellation_of: "original",
    });
    expect(html).toContain("-JP¥11,960");
    expect(html).not.toContain("119.60");
  });
  it("does not fall back to live identity if an issued snapshot is absent", () => {
    expect(
      invoiceHtml(
        { ...invoice, issuer_snapshot: null, customer_snapshot: null },
        { profile: issuer, customer },
      ),
    ).not.toContain("Frozen customer");
  });
  it("rejects non-finite, scientific notation and unsafe monetary inputs", () => {
    for (const input of [
      "NaN",
      "Infinity",
      "1e9",
      "1,20",
      "900719925474099100",
    ])
      expect(() => decimalToMinor(input, "EUR")).toThrow();
  });
});

describe("finance access and error boundaries", () => {
  it("does not construct a finance request or expose markup for member/disabled roles", () => {
    const client = new Proxy(
      {},
      {
        get() {
          throw new Error("Unexpected finance client access");
        },
      },
    ) as SupabaseClient;
    for (const role of ["member", "disabled"] as const) {
      const html = renderToStaticMarkup(
        createElement(FinanceArea, {
          client,
          role,
          workspace: {
            id: "w",
            name: "Private",
            timezone: "UTC",
            currency: "EUR",
            created_by: "u",
            created_at: "",
          },
          members: [],
          projects: [],
        }),
      );
      expect(html).toBe("");
    }
  });
  it("localizes controlled errors and never exposes raw database messages", () => {
    const error = {
      code: "database",
      message: "SELECT secret FROM finance; internal failure",
    };
    for (const locale of ["en", "de", "zh"] as const) {
      expect(financeError(error, locale)).not.toContain("SELECT");
      expect(financeError(error, locale)).not.toContain("internal failure");
    }
    expect(financeError({ code: "forbidden" }, "de")).toContain("Berechtigung");
    expect(financeError({ code: "validation" }, "zh")).toContain("检查");
  });
});


function overviewContext(invoices: Invoice[], locale: FinanceContextValue["locale"] = "en"): FinanceContextValue {
  return {
    service: {} as FinanceContextValue["service"],
    workspace: { id: "w", name: "Demo", timezone: "UTC", currency: "EUR", created_by: "u", created_at: "" },
    members: [], projects: [], role: "owner", locale,
    data: {
      clients: [], profile: null, rates: [], plans: [], expenses: [], invoices,
      overview: { workspace_id: "w", currency: "EUR", from: "2026-10-01", to: "2026-10-31", projects: [] },
    },
    busy: false, isDemo: true, errorMessage: null,
    range: { from: "2026-10-01", to: "2026-10-31" },
    t: (key) => ft(locale, key),
    run: async () => true,
  };
}
function overviewHtml(context: FinanceContextValue) {
  return renderToStaticMarkup(createElement(FinanceContext.Provider, { value: context }, createElement(Overview)));
}
const summaryInvoices: Invoice[] = [
  { ...invoice, id: "paid", project_id: "p1", net_minor: 150000000, paid: true },
  { ...invoice, id: "open", project_id: "p2", net_minor: 75000000 },
  { ...invoice, id: "cancelled", project_id: "p1", net_minor: 45000000, paid: true, cancellation_id: "credit" },
  { ...invoice, id: "credit", project_id: "p1", net_minor: -45000000, status: "cancellation", cancellation_of: "cancelled" },
  { ...invoice, id: "draft", project_id: "p1", net_minor: 999000000, status: "draft" },
];

describe("finance overview invoice summary", () => {
  it.each([
    ["en", "Invoiced net", "Paid net", "Open net", "Project plan volume", "Full project", "bank balance"],
    ["de", "Fakturiert netto", "Bezahlt netto", "Offen netto", "Geplantes Projektvolumen", "Gesamtes Projekt", "Kontostand"],
    ["zh", "已开票净额", "已付款净额", "未付款净额", "项目计划金额", "整个项目", "银行余额"],
  ] as const)("renders invoice totals and their scope in %s", (locale, invoiced, paid, open, plan, fullProject, balance) => {
    const html = overviewHtml(overviewContext(summaryInvoices, locale));
    expect(html).toContain(`<span>${invoiced}</span><strong>${money(225000000, "EUR", locale)}</strong>`);
    expect(html).toContain(`<span>${paid}</span><strong>${money(150000000, "EUR", locale)}</strong>`);
    expect(html).toContain(`<span>${open}</span><strong>${money(75000000, "EUR", locale)}</strong>`);
    expect(html).toContain(plan);
    expect(html).toContain(fullProject);
    expect(html).toContain(balance);
    expect(html).toContain('dateTime="2026-10-01"');
    expect(html).toContain('dateTime="2026-10-31"');
  });
});


describe("finance overview invoice periods", () => {
  it("uses inclusive issue dates instead of service or payment dates", () => {
    const invoices = [
      { ...invoice, id: "start", issue_date: "2026-10-01", service_from: "2026-09-01", net_minor: 10000, paid: true },
      { ...invoice, id: "end", issue_date: "2026-10-31", service_to: "2026-11-30", net_minor: 20000 },
      { ...invoice, id: "before", issue_date: "2026-09-30", net_minor: 900000 },
      { ...invoice, id: "after", issue_date: "2026-11-01", net_minor: 800000, paid: true },
    ];
    const html = overviewHtml(overviewContext(invoices));
    expect(html).toContain(`<span>Invoiced net</span><strong>€300.00</strong>`);
    expect(html).toContain(`<span>Paid net</span><strong>€100.00</strong>`);
    expect(html).toContain(`<span>Open net</span><strong>€200.00</strong>`);
  });
  it("shows zero actual invoicing for empty data or drafts alone", () => {
    for (const invoices of [[], [{ ...invoice, status: "draft" as const, net_minor: 999000000 }]]) {
      const html = overviewHtml(overviewContext(invoices));
      for (const label of ["Invoiced net", "Paid net", "Open net"]) {
        expect(html).toContain(`<span>${label}</span><strong>€0.00</strong>`);
      }
    }
  });
  it("keeps a prior-period cancellation negative without treating it as paid or open", () => {
    const html = overviewHtml(overviewContext([
      { ...invoice, id: "original", issue_date: "2026-09-30", net_minor: 10000, paid: true, cancellation_id: "credit" },
      { ...invoice, id: "credit", issue_date: "2026-10-01", net_minor: -10000, paid: true, status: "cancellation", cancellation_of: "original" },
    ]));
    expect(html).toContain(`<span>Invoiced net</span><strong>-€100.00</strong>`);
    expect(html).toContain(`<span>Paid net</span><strong>€0.00</strong>`);
    expect(html).toContain(`<span>Open net</span><strong>€0.00</strong>`);
  });
});


describe("invoice summary project filters", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };
  it("uses the selected project for invoiced, paid and open totals", () => {
    expect(summarizeInvoices(summaryInvoices, range, "p1")).toEqual({
      invoicedNet: 150000000, paidNet: 150000000, openNet: 0, overdueNet: 0, overdueCount: 0,
    });
    expect(summarizeInvoices(summaryInvoices, range, "p2")).toEqual({
      invoicedNet: 75000000, paidNet: 0, openNet: 75000000, overdueNet: 0, overdueCount: 0,
    });
    expect(summarizeInvoices(summaryInvoices, range, "missing")).toEqual({
      invoicedNet: 0, paidNet: 0, openNet: 0, overdueNet: 0, overdueCount: 0,
    });
  });
  it("keeps unassigned invoices only in the all-project view and combines date filtering", () => {
    const invoices = [
      ...summaryInvoices,
      { ...invoice, id: "unassigned", net_minor: 12000 },
      { ...invoice, id: "previous", project_id: "p2", issue_date: "2026-09-30", net_minor: 9999999, paid: true },
    ];
    expect(summarizeInvoices(invoices, range, "")).toEqual({
      invoicedNet: 225012000, paidNet: 150000000, openNet: 75012000, overdueNet: 0, overdueCount: 0,
    });
    expect(summarizeInvoices(invoices, range, "p2")).toEqual({
      invoicedNet: 75000000, paidNet: 0, openNet: 75000000, overdueNet: 0, overdueCount: 0,
    });
  });
  it("counts overdue only for issued, unpaid, past-due invoices without a cancellation", () => {
    const base = { ...invoice, project_id: "p1", issue_date: "2026-10-05", due_date: "2026-10-10", paid: false, cancellation_id: null };
    const invoices = [
      { ...base, id: "late", net_minor: 1000 },
      { ...base, id: "paid-late", net_minor: 2000, paid: true },
      { ...base, id: "cancelled-late", net_minor: 4000, cancellation_id: "c1" },
      { ...base, id: "due-today", net_minor: 8000, due_date: "2026-10-20" },
      { ...base, id: "future", net_minor: 16000, due_date: "2026-11-30" },
    ] as Invoice[];
    expect(isOverdue(invoices[0]!, "2026-10-20")).toBe(true);
    expect(isOverdue(invoices[3]!, "2026-10-20")).toBe(false);
    expect(summarizeInvoices(invoices, range, "p1", "2026-10-20")).toMatchObject({ overdueNet: 1000, overdueCount: 1 });
    // Ohne Stichtag (ältere Aufrufer) wird nichts als überfällig gezählt.
    expect(summarizeInvoices(invoices, range, "p1")).toMatchObject({ overdueNet: 0, overdueCount: 0 });
  });
  it.each([true, false])("excludes a currently cancelled original from paid/open even if its credit is later (paid=%s)", (paid) => {
    const invoices: Invoice[] = [
      { ...invoice, id: "original", project_id: "p1", net_minor: 10000, paid, cancellation_id: "credit" },
      { ...invoice, id: "credit", project_id: "p1", issue_date: "2026-11-01", net_minor: -10000, status: "cancellation", cancellation_of: "original" },
    ];
    expect(summarizeInvoices(invoices, range, "p1")).toEqual({
      invoicedNet: 10000, paidNet: 0, openNet: 0, overdueNet: 0, overdueCount: 0,
    });
    expect(summarizeInvoices(invoices, { from: "2026-10-01", to: "2026-11-01" }, "p1")).toEqual({
      invoicedNet: 0, paidNet: 0, openNet: 0, overdueNet: 0, overdueCount: 0,
    });
  });
});

describe("finance pagination errors", () => {
  it.each([
    ["en", "time_entry_limit", "More than 50,000 time entries matched. Please narrow the date range."],
    ["de", "time_entry_limit", "Mehr als 50.000 Zeiteinträge. Bitte Zeitraum verkleinern."],
    ["zh", "time_entry_limit", "匹配的工时记录超过 50,000 条，请缩小日期范围。"],
    ["en", "result_incomplete", "Time entries could not be loaded completely. Please reload and try again."],
    ["de", "result_incomplete", "Zeiteinträge konnten nicht vollständig geladen werden. Bitte neu laden und erneut versuchen."],
    ["zh", "result_incomplete", "无法完整加载工时记录，请刷新后重试。"],
  ] as const)("explains %s %s without exposing server details", (locale, code, message) => {
    expect(financeError({ code, message: "SELECT private FROM finance" }, locale)).toBe(message);
  });
});


describe("invoice payment scope labels", () => {
  it.each([
    ["en", "Current status"], ["de", "Aktueller Status"], ["zh", "当前状态"],
  ] as const)("labels paid and open as status snapshots in %s", (locale, label) => {
    const html = overviewHtml(overviewContext(summaryInvoices, locale));
    expect(html.split(`<small>EUR · ${label}</small>`)).toHaveLength(3);
  });
});

describe("connected finance project scope", () => {
  function context(projectId: string, locale: FinanceContextValue["locale"] = "en") {
    const value = overviewContext([
      { ...invoice, id: "invoice-alpha", number: "INV-ALPHA", project_id: "p1", net_minor: 12000 },
      { ...invoice, id: "invoice-beta", number: "INV-BETA", project_id: "p2", net_minor: 34000 },
      { ...invoice, id: "invoice-unassigned", number: "INV-UNASSIGNED", project_id: null, net_minor: 56000 },
    ], locale);
    value.projects = ["p1", "p2"].map((id, index) => ({
      id, workspace_id: "w", code: id, name: index ? "Beta" : "Alpha",
      client: "", budget_minutes: 0, status: "active", color: "", created_at: "",
    }));
    value.data.clients = [customer];
    value.data.overview.projects = value.projects.map((project, index) => ({
      project_id: project.id, billing_mode: "hourly", planned_minutes: 60,
      actual_minutes: 30, billable_minutes: 30, remaining_minutes: 30,
      planned_revenue_minor: index ? 34000 : 12000, planned_labor_cost_minor: 0,
      planned_cost_minor: 0, planned_margin_minor: 0, actual_labor_cost_minor: 0,
      actual_expenses_minor: 0, actual_cost_minor: 0, actual_billable_value_minor: 0,
      forecast_cost_minor: 0, forecast_margin_minor: 0, missing_cost_entries: 0,
      missing_bill_entries: 0, missing_estimate_costs: 0,
    }));
    value.data.plans = value.projects.map((project, index) => ({
      workspace_id: "w", project_id: project.id, client_id: "c", billing_mode: "hourly",
      default_bill_rate_minor: null, fixed_fee_minor: index ? 34000 : 12000,
      planned_expenses_minor: 0, created_at: "", lines: [],
    }));
    value.data.expenses = value.projects.map((project, index) => ({
      id: `expense-${project.id}`, workspace_id: "w", project_id: project.id,
      expense_date: "2026-10-01", description: index ? "Beta expense" : "Alpha expense",
      amount_minor: 100, category: "other", not_time_costed: true, created_at: "",
    }));
    return { ...value, projectId, setProjectId: () => {}, navigate: () => {} } as FinanceContextValue;
  }
  function html(component: typeof Overview | typeof Planning | typeof Invoices, value: FinanceContextValue) {
    return renderToStaticMarkup(createElement(FinanceContext.Provider, { value }, createElement(component)));
  }
  it("applies the same selected project to overview totals, planning and invoice rows", () => {
    const value = context("p2");
    const overview = html(Overview, value);
    expect(overview).toContain("<span>Invoiced net</span><strong>€340.00</strong>");
    expect(overview).toContain("<span>Project plan volume</span><strong>€340.00</strong>");
    const planning = html(Planning, value);
    expect(planning).toContain('name="fixed_fee_minor"');
    expect(planning).toContain('value="340.00"');
    expect(planning).toContain("Beta expense");
    expect(planning).not.toContain("Alpha expense");
    const invoices = html(Invoices, value);
    expect(invoices).toContain("INV-BETA");
    expect(invoices).not.toContain("INV-ALPHA");
    expect(invoices).not.toContain("INV-UNASSIGNED");
  });
  it("keeps all projects explicit, including unassigned invoices, without choosing a planning editor", () => {
    const value = context("");
    expect(html(Overview, value)).toContain("<span>Invoiced net</span><strong>€1,020.00</strong>");
    expect(html(Invoices, value)).toContain("INV-UNASSIGNED");
    expect(html(Planning, value)).not.toContain('name="fixed_fee_minor"');
  });
  it("never broadens an unavailable project into all projects or a first-project plan", () => {
    const value = context("missing-project");
    const overview = html(Overview, value);
    expect(overview).toContain("<span>Invoiced net</span><strong>€0.00</strong>");
    expect(overview).toContain("Project unavailable");
    expect(html(Invoices, value)).not.toContain("INV-ALPHA");
    expect(html(Invoices, value)).not.toContain("INV-BETA");
    expect(html(Planning, value)).not.toContain('name="fixed_fee_minor"');
    expect(html(Planning, value)).not.toContain("Alpha expense");
  });
  it("rejects a foreign project even when stale data contains its matching ID", () => {
    const value = context("p2");
    value.projects[1].workspace_id = "another-workspace";
    expect(html(Overview, value)).toContain("<span>Invoiced net</span><strong>€0.00</strong>");
    expect(html(Invoices, value)).not.toContain("INV-BETA");
    expect(html(Planning, value)).not.toContain('name="fixed_fee_minor"');
  });
  function draftProject(value: FinanceContextValue, item?: Invoice, time = false) {
    const props = { onClose: () => {}, onSaved: () => {} };
    const output = renderToStaticMarkup(createElement(FinanceContext.Provider, { value },
      time ? createElement(TimeDraft, props) : createElement(DraftEditor, { ...props, invoice: item })));
    return output.match(/<input type="hidden" name="project_id" value="([^"]*)"/)?.[1];
  }
  it.each([false, true])("prefills new drafts with the selected project (from time: %s)", (time) => {
    const value = context("p2");
    expect(draftProject(value, undefined, time)).toBe("p2");
  });
  it("retains an existing draft assignment, including deliberately unassigned drafts", () => {
    const value = context("p2");
    expect(draftProject(value, { ...invoice, status: "draft", project_id: "p1" })).toBe("p1");
    expect(draftProject(value, { ...invoice, status: "draft", project_id: null })).toBe("");
  });
  it("uses unassigned manual drafts and a required first project only in explicit all-project scope", () => {
    const value = context("");
    expect(draftProject(value)).toBe("");
    expect(draftProject(value, undefined, true)).toBe("p1");
  });
  it.each([
    ["en", "Project work", "Tasks", "Time", "Planning & costs", "Invoices"],
    ["de", "Projektarbeit", "Aufgaben", "Zeiten", "Planung & Kosten", "Rechnungen"],
    ["zh", "项目工作", "任务", "工时", "规划与成本", "发票"],
  ] as const)("exposes contextual project and finance destinations in %s", (locale, work, tasks, time, planning, invoices) => {
    const output = html(Overview, context("p2", locale));
    expect(output).toContain(`<summary>${work}</summary>`);
    expect(output).toContain(`>${tasks}</button>`);
    expect(output).toContain(`>${time}</button>`);
    expect(output).toContain(`>${planning.replaceAll("&", "&amp;")}</button>`);
    expect(output).toContain(`>${invoices}</button>`);
    expect(output).toContain('aria-label="Beta"');
  });
});
