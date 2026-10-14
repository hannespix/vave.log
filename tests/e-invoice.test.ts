import { describe, it, expect } from "vitest";
import { einvoiceXml } from "../src/web/finance/e-invoice";
import type { Invoice, InvoiceLine } from "../src/shared/finance-types";

const line = (extra: Partial<InvoiceLine>): InvoiceLine => ({
  description: "Design", quantity: 1, unit_price_minor: 10000, tax_basis_points: 1900,
  zero_tax_reason: "", time_entry_id: null, net_minor: 10000, tax_minor: 1900, total_minor: 11900, ...extra,
});
const invoice: Invoice = {
  id: "inv-1", workspace_id: "w", client_id: "c", project_id: null, created_at: "", language: "de",
  status: "issued", number: "INV-2026-0042", currency: "EUR",
  issue_date: "2026-10-13", due_date: "2026-11-13", service_from: "2026-10-01", service_to: "2026-10-13",
  notes: "Danke & bis bald", payment_instructions: "Überweisung binnen 30 Tagen",
  lines: [
    line({ description: "Workshop <Konzept>" }),
    line({ description: "Zeit", quantity: 1.5167, unit_price_minor: 5000, net_minor: 7583, tax_minor: 1441, total_minor: 9024, time_entry_ids: ["e1", "e2"] }),
    line({ description: "Export", unit_price_minor: 2000, tax_basis_points: 0, zero_tax_reason: "Reverse charge", net_minor: 2000, tax_minor: 0, total_minor: 2000 }),
  ],
  net_minor: 19583, tax_minor: 3341, total_minor: 22924,
  issuer_snapshot: { workspace_id: "w", legal_name: "Studio & Co", billing_address: "Hauptstraße 1\n79098 Freiburg\nDeutschland", tax_id: "DE123456789", payment_details: "", invoice_prefix: "INV", footer: "", country: "DE" },
  customer_snapshot: { id: "c", workspace_id: "w", created_at: "", name: "Müller GmbH", billing_address: "Weg 2\n4000 Basel", contact_email: "", tax_id: "CHE-123", language: "de" },
  issued_at: "2026-10-13T10:00:00Z", cancellation_of: null, cancellation_reason: "",
  paid: false, cancellation_id: null,
};

describe("EN 16931 e-invoice (CII)", () => {
  const xml = einvoiceXml(invoice);
  it("carries the EN 16931 guideline, document identity and 102 dates", () => {
    expect(xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(xml).toContain("<ram:ID>INV-2026-0042</ram:ID>");
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toContain('<udt:DateTimeString format="102">20261013</udt:DateTimeString>');
    expect(xml).toContain('<udt:DateTimeString format="102">20261113</udt:DateTimeString>');
  });
  it("itemizes VAT per rate with basis, amount, category and exemption reason", () => {
    expect(xml).toContain("<ram:CalculatedAmount>33.41</ram:CalculatedAmount>");
    expect(xml).toContain("<ram:BasisAmount>175.83</ram:BasisAmount>");
    expect(xml).toContain("<ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent>");
    expect(xml).toContain("<ram:ExemptionReason>Reverse charge</ram:ExemptionReason>");
    expect(xml).toContain("<ram:BasisAmount>20.00</ram:BasisAmount><ram:CategoryCode>E</ram:CategoryCode>");
  });
  it("totals match the frozen amounts and the currency is explicit", () => {
    expect(xml).toContain("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>");
    expect(xml).toContain("<ram:LineTotalAmount>195.83</ram:LineTotalAmount>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">33.41</ram:TaxTotalAmount>');
    expect(xml).toContain("<ram:GrandTotalAmount>229.24</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:DuePayableAmount>229.24</ram:DuePayableAmount>");
  });
  it("marks time lines as hours and other lines as units, escaping every user value", () => {
    expect(xml).toContain('unitCode="HUR">1.5167<');
    expect(xml).toContain('unitCode="C62">1<');
    expect(xml).toContain("Workshop &lt;Konzept&gt;");
    expect(xml).toContain("Studio &amp; Co");
    expect(xml).toContain("Danke &amp; bis bald");
    expect(xml).not.toContain("<Konzept>");
  });
  it("freezes party countries with a DE fallback for old snapshots", () => {
    expect(xml).toContain("<ram:CountryID>DE</ram:CountryID>");
    const swiss = einvoiceXml({ ...invoice, customer_snapshot: { ...invoice.customer_snapshot!, country: "CH" } });
    expect(swiss).toContain("<ram:CountryID>CH</ram:CountryID>");
    expect(xml).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');
  });
  it("exports a cancellation as a negative invoice and refuses drafts", () => {
    const credit = einvoiceXml({
      ...invoice, status: "cancellation", number: "INV-2026-0043", cancellation_of: "inv-1", cancellation_reason: "Falsche Leistung",
      lines: invoice.lines.map((l) => ({ ...l, quantity: -l.quantity, net_minor: -l.net_minor, tax_minor: -l.tax_minor, total_minor: -l.total_minor })),
      net_minor: -19583, tax_minor: -3341, total_minor: -22924,
    });
    expect(credit).toContain("<ram:GrandTotalAmount>-229.24</ram:GrandTotalAmount>");
    expect(credit).toContain('unitCode="C62">-1<');
    expect(credit).toContain("Falsche Leistung");
    expect(() => einvoiceXml({ ...invoice, status: "draft", number: null, issuer_snapshot: null, customer_snapshot: null })).toThrow();
  });
  it("marks demo documents in a note", () => {
    expect(einvoiceXml({ ...invoice, is_demo: true })).toContain("DEMO — Nicht zur Zahlung");
    expect(xml).not.toContain("DEMO");
  });
});
