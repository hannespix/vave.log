import type { Invoice } from "../../shared/finance-types";
import { taxBreakdown } from "./documents";

/**
 * DATEV-Buchungsstapel im EXTF-Format (Format-Version 700, Kategorie 21
 * „Buchungsstapel", Formatname „Buchungsstapel" Version 13) — die Brücke zum
 * Steuerberater: jede ausgestellte Rechnung wird je Steuersatz als eine
 * Buchung Debitor an Erlöskonto übergeben (Bruttobetrag; Basis sind die
 * eingefrorenen, serverseitig gerundeten Beträge aus taxBreakdown). Ein
 * Storno reist als Haben-Buchung (Soll/Haben-Kennzeichen H) mit positivem
 * Betrag. Textfelder werden ASCII-transliteriert (ä→ae, ß→ss …), damit die
 * Datei unabhängig vom Import-Encoding (DATEV erwartet klassisch ANSI)
 * verlustfrei ankommt. Kontenrahmen und Nummern kommen aus dem Export-Dialog;
 * die Vorgaben folgen SKR03 und sind mit der Kanzlei abzustimmen.
 */
export interface DatevOptions {
  consultant: string; // Beraternummer (1–7 Ziffern)
  client: string; // Mandantennummer (1–5 Ziffern)
  debtorAccount: string; // Debitoren-/Sammelkonto, z. B. 10000
  revenueAccounts: Record<number, string>; // Erlöskonto je Steuersatz in Basispunkten
  fiscalYearStart: string; // ISO-Datum, z. B. 2026-01-01
  from: string;
  to: string;
}
export const DATEV_DEFAULT_REVENUE: Record<number, string> = {
  1900: "8400", // SKR03: Erlöse 19 % USt (Automatikkonto)
  700: "8300", // SKR03: Erlöse 7 % USt
  0: "8120", // SKR03: steuerfreie Umsätze § 4 Nr. 1a (mit Kanzlei abstimmen)
};
const translit = (value: string) =>
  value
    .replace(/[äÄöÖüÜß€]/g, (c) => (({ "ä": "ae", "Ä": "Ae", "ö": "oe", "Ö": "Oe", "ü": "ue", "Ü": "Ue", "ß": "ss", "€": "EUR" }) as Record<string, string>)[c] || "")
    .normalize("NFD")
    // oxlint-disable-next-line no-control-regex -- bewusst: alles außerhalb druckbarem ASCII entfernen
    .replace(/[^\x20-\x7e]/g, "");
const field = (value: string, max: number) =>
  `"${translit(value).slice(0, max).replaceAll('"', "")}"`;
const amount = (minor: number) => {
  const abs = Math.abs(minor);
  return `${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
};
const compact = (iso: string) => iso.replaceAll("-", "");
/** Eine Buchungszeile hat 125 Felder; wir füllen die ersten 14 (Pflichtteil) und lassen den Rest leer. */
function row(gross: number, side: "S" | "H", account: string, contra: string, issueDate: string, document: string, text: string) {
  const cells = Array.from({ length: 125 }, () => "");
  cells[0] = amount(gross); // Umsatz (ohne Vorzeichen)
  cells[1] = `"${side}"`; // Soll/Haben-Kennzeichen
  cells[2] = ""; // WKZ Umsatz (leer = Basiswährung des Mandanten)
  cells[6] = account; // Konto (Debitor)
  cells[7] = contra; // Gegenkonto (Erlös)
  cells[8] = ""; // BU-Schlüssel (leer: Automatikkonto steuert die USt)
  cells[9] = issueDate.slice(6, 8) + issueDate.slice(4, 6); // Belegdatum TTMM
  cells[10] = field(document, 36); // Belegfeld 1 = Rechnungsnummer
  cells[13] = field(text, 60); // Buchungstext
  return cells.join(";");
}
export function datevCsv(invoices: readonly Invoice[], options: DatevOptions): string {
  const created = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17).padEnd(17, "0");
  const header = [
    '"EXTF"', "700", "21", '"Buchungsstapel"', "13", created, "", '""', '""', '""',
    options.consultant, options.client, compact(options.fiscalYearStart), "4",
    compact(options.from), compact(options.to), '"vave.log"', '""', "1", "0", "0",
    '"EUR"', "", '""', "", "", '""', '""', "", "", '""',
  ].join(";");
  const columns = [
    "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz",
    "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
    ...Array.from({ length: 111 }, (_, i) => `Feld ${i + 15}`),
  ].map((name) => `"${name}"`).join(";");
  const rows: string[] = [];
  for (const invoice of invoices) {
    if (invoice.status === "draft" || !invoice.number) continue;
    if (invoice.issue_date < options.from || invoice.issue_date > options.to) continue;
    for (const group of taxBreakdown(invoice.lines)) {
      const gross = group.net_minor + group.tax_minor;
      if (gross === 0) continue;
      rows.push(row(
        gross,
        gross > 0 ? "S" : "H",
        options.debtorAccount,
        options.revenueAccounts[group.basisPoints] || options.revenueAccounts[0] || "8400",
        compact(invoice.issue_date),
        invoice.number,
        `${invoice.customer_snapshot?.name || ""} ${invoice.number}`.trim(),
      ));
    }
  }
  return [header, columns, ...rows].join("\r\n") + "\r\n";
}
