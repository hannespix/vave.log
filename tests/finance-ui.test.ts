import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FinanceArea } from "../src/web/finance";
import { financeError } from "../src/web/finance/catalog";
import { describe, expect, it } from "vitest";
import {
  currencyDigits,
  decimalToMinor,
  money,
  invoiceHtml,
  invoiceCsv,
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
