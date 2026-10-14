import type { BillingProfile, FinanceClient, Invoice } from "../../shared/finance-types";
import { ft } from "./catalog";
import { minorInput, taxBreakdown } from "./documents";

/**
 * E-Rechnung nach EN 16931 im CII-Syntax (UN/CEFACT CrossIndustryInvoice,
 * Guideline urn:cen.eu:en16931:2017 — das Profil, das ZUGFeRD „EN 16931" und
 * XRechnung teilen). Erzeugt wird ausschließlich aus den EINGEFRORENEN
 * Snapshots einer ausgestellten Rechnung; es gibt keine Geheimnisse, deshalb
 * läuft die Erzeugung clientseitig. Ein Storno reist als negative Rechnung
 * (TypeCode 380 mit negativen Mengen und Beträgen), wie bei ZUGFeRD üblich.
 * Steuerkategorien: Satz > 0 ⇒ S (Standard), Satz 0 ⇒ E (befreit) mit der
 * Null-Steuer-Begründung als ExemptionReason — feinere Kategorien (AE, K, G)
 * folgen, sobald Zeilen eine Kategorie tragen.
 */
const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
const date102 = (iso: string) =>
  `<udt:DateTimeString format="102">${iso.replaceAll("-", "")}</udt:DateTimeString>`;
const rate = (basisPoints: number) => {
  const value = basisPoints / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};
function address(name: string, freeText: string, country: string, taxId: string) {
  const lines = freeText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2);
  return (
    `<ram:Name>${esc(name)}</ram:Name><ram:PostalTradeAddress>` +
    lines.map((line, i) => `<ram:Line${i ? "Two" : "One"}>${esc(line)}</ram:Line${i ? "Two" : "One"}>`).join("") +
    `<ram:CountryID>${esc(country)}</ram:CountryID></ram:PostalTradeAddress>` +
    (taxId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(taxId)}</ram:ID></ram:SpecifiedTaxRegistration>` : "")
  );
}
/** Nur ausgestellte Dokumente (Rechnung oder Storno) haben Nummer und Snapshots. */
export function einvoiceXml(invoice: Invoice): string {
  if (invoice.status === "draft" || !invoice.number || !invoice.issuer_snapshot || !invoice.customer_snapshot)
    throw new Error("E-invoice requires an issued document.");
  const issuer: BillingProfile = invoice.issuer_snapshot,
    customer: FinanceClient = invoice.customer_snapshot,
    currency = invoice.currency,
    amount = (minor: number) => minorInput(minor, currency),
    rates = taxBreakdown(invoice.lines);
  const notes = [
    ...(invoice.is_demo ? [ft(invoice.language, "demoMark")] : []),
    ...(invoice.notes ? [invoice.notes] : []),
    ...(invoice.cancellation_reason ? [invoice.cancellation_reason] : []),
  ];
  const lineXml = invoice.lines
    .map(
      (line, index) =>
        `<ram:IncludedSupplyChainTradeLineItem>` +
        `<ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
        `<ram:SpecifiedTradeProduct><ram:Name>${esc(line.description)}</ram:Name></ram:SpecifiedTradeProduct>` +
        `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(line.unit_price_minor)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
        `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${line.time_entry_id || line.time_entry_ids?.length ? "HUR" : "C62"}">${line.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
        `<ram:SpecifiedLineTradeSettlement>` +
        `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${line.tax_basis_points > 0 ? "S" : "E"}</ram:CategoryCode><ram:RateApplicablePercent>${rate(line.tax_basis_points)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` +
        `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(line.net_minor)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
        `</ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join("");
  const taxXml = rates
    .map((group) => {
      const reason =
        group.basisPoints === 0
          ? invoice.lines.find((line) => line.tax_basis_points === 0 && line.zero_tax_reason)?.zero_tax_reason || ""
          : "";
      return (
        `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(group.tax_minor)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>` +
        (reason ? `<ram:ExemptionReason>${esc(reason)}</ram:ExemptionReason>` : "") +
        `<ram:BasisAmount>${amount(group.net_minor)}</ram:BasisAmount><ram:CategoryCode>${group.basisPoints > 0 ? "S" : "E"}</ram:CategoryCode><ram:RateApplicablePercent>${rate(group.basisPoints)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">` +
    `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>` +
    `<rsm:ExchangedDocument><ram:ID>${esc(invoice.number)}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime>${date102(invoice.issue_date)}</ram:IssueDateTime>` +
    notes.map((note) => `<ram:IncludedNote><ram:Content>${esc(note)}</ram:Content></ram:IncludedNote>`).join("") +
    `</rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction>` +
    lineXml +
    `<ram:ApplicableHeaderTradeAgreement>` +
    `<ram:SellerTradeParty>${address(issuer.legal_name, issuer.billing_address, issuer.country || "DE", issuer.tax_id)}</ram:SellerTradeParty>` +
    `<ram:BuyerTradeParty>${address(customer.name, customer.billing_address, customer.country || "DE", customer.tax_id)}</ram:BuyerTradeParty>` +
    `</ram:ApplicableHeaderTradeAgreement>` +
    `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date102(invoice.service_to)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>` +
    `<ram:ApplicableHeaderTradeSettlement>` +
    `<ram:InvoiceCurrencyCode>${esc(currency)}</ram:InvoiceCurrencyCode>` +
    taxXml +
    `<ram:BillingSpecifiedPeriod><ram:StartDateTime>${date102(invoice.service_from)}</ram:StartDateTime><ram:EndDateTime>${date102(invoice.service_to)}</ram:EndDateTime></ram:BillingSpecifiedPeriod>` +
    `<ram:SpecifiedTradePaymentTerms>` +
    (invoice.payment_instructions ? `<ram:Description>${esc(invoice.payment_instructions)}</ram:Description>` : "") +
    `<ram:DueDateDateTime>${date102(invoice.due_date)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>` +
    `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:LineTotalAmount>${amount(invoice.net_minor)}</ram:LineTotalAmount>` +
    `<ram:TaxBasisTotalAmount>${amount(invoice.net_minor)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="${esc(currency)}">${amount(invoice.tax_minor)}</ram:TaxTotalAmount>` +
    `<ram:GrandTotalAmount>${amount(invoice.total_minor)}</ram:GrandTotalAmount>` +
    `<ram:DuePayableAmount>${amount(invoice.total_minor)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `</ram:ApplicableHeaderTradeSettlement>` +
    `</rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`
  );
}
