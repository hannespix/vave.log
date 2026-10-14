import { describe, it, expect } from "vitest";
import { DATEV_DEFAULT_REVENUE, datevCsv, type DatevOptions } from "../src/web/finance/datev";
import type { Invoice, InvoiceLine } from "../src/shared/finance-types";

const line = (extra: Partial<InvoiceLine>): InvoiceLine => ({
  description: "Design", quantity: 1, unit_price_minor: 10000, tax_basis_points: 1900,
  zero_tax_reason: "", time_entry_id: null, net_minor: 10000, tax_minor: 1900, total_minor: 11900, ...extra,
});
const base: Invoice = {
  id: "inv-1", workspace_id: "w", client_id: "c", project_id: null, created_at: "", language: "de",
  status: "issued", number: "INV-2026-0042", currency: "EUR",
  issue_date: "2026-10-13", due_date: "2026-11-13", service_from: "2026-10-01", service_to: "2026-10-13",
  notes: "", payment_instructions: "",
  lines: [line({}), line({ unit_price_minor: 2000, tax_basis_points: 0, zero_tax_reason: "Reverse charge", net_minor: 2000, tax_minor: 0, total_minor: 2000 })],
  net_minor: 12000, tax_minor: 1900, total_minor: 13900,
  issuer_snapshot: null, customer_snapshot: { id: "c", workspace_id: "w", created_at: "", name: "Müller & Söhne", billing_address: "", contact_email: "", tax_id: "", language: "de" },
  issued_at: "2026-10-13T10:00:00Z", cancellation_of: null, cancellation_reason: "", paid: false, cancellation_id: null,
};
const options: DatevOptions = {
  consultant: "1234567", client: "42", debtorAccount: "10000",
  revenueAccounts: { 1900: "8400", 0: "8120" },
  fiscalYearStart: "2026-01-01", from: "2026-10-01", to: "2026-10-31",
};

describe("DATEV posting batch (EXTF)", () => {
  const csv = datevCsv([base], options);
  const [header, columns, ...rows] = csv.trimEnd().split("\r\n");
  it("writes the EXTF 700 header with consultant, client, fiscal year and range", () => {
    const h = header!.split(";");
    expect(h.slice(0, 5)).toEqual(['"EXTF"', "700", "21", '"Buchungsstapel"', "13"]);
    expect(h[10]).toBe("1234567");
    expect(h[11]).toBe("42");
    expect(h[12]).toBe("20260101");
    expect(h[14]).toBe("20261001");
    expect(h[15]).toBe("20261031");
    expect(columns).toContain('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen"');
  });
  it("posts one debit row per tax rate with gross amount, accounts, TTMM date and transliterated text", () => {
    expect(rows).toHaveLength(2);
    const zero = rows[0]!.split(";"), standard = rows[1]!.split(";");
    expect(standard).toHaveLength(125);
    expect(standard[0]).toBe("119,00");
    expect(standard[1]).toBe('"S"');
    expect(standard[6]).toBe("10000");
    expect(standard[7]).toBe("8400");
    expect(standard[9]).toBe("1310");
    expect(standard[10]).toBe('"INV-2026-0042"');
    expect(standard[13]).toBe('"Mueller & Soehne INV-2026-0042"');
    expect(zero[0]).toBe("20,00");
    expect(zero[7]).toBe("8120");
  });
  it("books cancellations as credit (H) rows with positive amounts", () => {
    const credit = datevCsv([{
      ...base, status: "cancellation", number: "INV-2026-0043", cancellation_of: "inv-1",
      lines: base.lines.map((l) => ({ ...l, quantity: -l.quantity, net_minor: -l.net_minor, tax_minor: -l.tax_minor, total_minor: -l.total_minor })),
      net_minor: -12000, tax_minor: -1900, total_minor: -13900,
    }], options).trimEnd().split("\r\n").slice(2);
    expect(credit[1]!.split(";")[0]).toBe("119,00");
    expect(credit[1]!.split(";")[1]).toBe('"H"');
  });
  it("skips drafts and documents outside the range, and falls back for unknown rates", () => {
    const outside = { ...base, id: "x", number: "INV-2026-0050", issue_date: "2026-09-30" };
    const draft = { ...base, id: "d", status: "draft" as const, number: null };
    expect(datevCsv([outside, draft], options).trimEnd().split("\r\n")).toHaveLength(2);
    const odd = datevCsv([{ ...base, lines: [line({ tax_basis_points: 500, tax_minor: 500, total_minor: 10500 })], net_minor: 10000, tax_minor: 500, total_minor: 10500 }], { ...options, revenueAccounts: { 0: "8120" } });
    expect(odd.trimEnd().split("\r\n")[2]!.split(";")[7]).toBe("8120");
    expect(DATEV_DEFAULT_REVENUE[1900]).toBe("8400");
  });
});
