import type { Invoice } from "../../shared/finance-types";
import { fold } from "../helpers";
import { currencyDigits } from "./documents";

/**
 * Bankabgleich, Stufe 1: Kontoauszüge (CAMT.053/.054 oder Bank-CSV) lesen und
 * Zahlungseingänge offenen Rechnungen zuordnen. Alles läuft im Browser; der
 * Auszug selbst wird nicht gespeichert. Gebucht wird erst nach Bestätigung über
 * die vorhandene Zahlungserfassung (finance_record_payment). Die Bankreferenz
 * steht in der Zahlungsnotiz („ref:…“) und verhindert Doppelbuchungen beim
 * erneuten Einlesen desselben Auszugs.
 */
export interface BankTransaction {
  /** Stabile Kennung der Buchung (Hash aus Bankreferenz, Datum, Betrag, Gegenpartei, Zweck). */
  key: string;
  date: string;
  /** Betrag in Kleinsteinheiten, immer positiv; Richtung in `credit`. */
  amount_minor: number;
  currency: string;
  credit: boolean;
  name: string;
  iban: string;
  purpose: string;
}
export interface ParsedStatement {
  format: "camt" | "csv";
  transactions: BankTransaction[];
  /** Zeilen/Buchungen, die nicht gelesen werden konnten (Anzahl). */
  skipped: number;
}
export type MatchConfidence = "high" | "medium" | "low";
export type MatchReason = "number" | "amount" | "name" | "partial" | "overpaid" | "early" | "duplicate";
export interface MatchProposal {
  transaction: BankTransaction;
  /** Vorgeschlagene Rechnung oder null (kein brauchbarer Treffer). */
  invoiceId: string | null;
  /** Zu buchender Betrag: Eingang, höchstens der offene Rest. */
  amount_minor: number;
  confidence: MatchConfidence | null;
  reasons: MatchReason[];
  /** Diese Bankbuchung ist schon als Zahlung erfasst (gleiche ref). */
  booked: boolean;
}

export class StatementError extends Error {
  constructor(public readonly code: "empty" | "format" | "noRows") { super(code); }
}

// ---------------------------------------------------------------- Einlesen

/** UTF-8, sonst Windows-1252 (Sparkasse, Volksbank und viele Banken liefern CSV in ANSI). */
export function decodeStatement(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseStatement(text: string): ParsedStatement {
  const trimmed = text.trim();
  if (!trimmed) throw new StatementError("empty");
  if (trimmed.startsWith("<")) return parseCamt(trimmed);
  return parseBankCsv(trimmed);
}

/** FNV-1a über den Text, zweimal mit verschiedenem Startwert → 12 Zeichen base36. */
function hash(value: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return (a.toString(36).padStart(7, "0") + b.toString(36).padStart(7, "0")).slice(0, 12);
}
const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
const transaction = (t: Omit<BankTransaction, "key">, bankRef: string): BankTransaction => ({
  ...t,
  name: clean(t.name, 140),
  purpose: clean(t.purpose, 420),
  iban: t.iban.replace(/\s+/g, "").toUpperCase().slice(0, 34),
  key: hash([bankRef, t.date, t.amount_minor, t.currency, t.credit ? "C" : "D", fold(t.name), fold(t.purpose)].join("|")),
});

/** Betrag als Text („1.234,56“, „1234.56“, „-12,5“) exakt in Kleinsteinheiten. */
export function amountToMinor(raw: string, currency: string): number | null {
  let value = raw.replace(/[\s '€$£]/g, "").replace(/[A-Z]{3}$/i, "");
  if (!value) return null;
  const negative = /^-|-$|^\(.*\)$/.test(value);
  value = value.replace(/^[-+(]|[-)]$/g, "");
  const commas = value.split(",").length - 1, dots = value.split(".").length - 1;
  let whole = value, fraction = "";
  // Nur ein Trennzeichen-Typ, mehrfach oder genau einmal mit drei Folgeziffern: Tausendergruppen („1.234“, „1,234,567“).
  const single = commas === 0 || dots === 0;
  const grouping = single && (commas + dots > 1 || /^\d{1,3}[.,]\d{3}$/.test(value));
  if (commas + dots > 0 && !grouping) {
    const idx = Math.max(value.lastIndexOf(","), value.lastIndexOf("."));
    whole = value.slice(0, idx);
    fraction = value.slice(idx + 1);
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole || "0") || !/^\d*$/.test(fraction)) return null;
  const digits = currencyDigits(currency || "EUR");
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  const minor = Number(whole || "0") * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** TT.MM.JJJJ, TT.MM.JJ, JJJJ-MM-TT, TT/MM/JJJJ → ISO; sonst "". */
export function isoDate(raw: string): string {
  const value = raw.trim();
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (m[3].length === 2) y += 2000;
  } else return "";
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- CAMT (ISO 20022)

interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) =>
  code[0] === "#" ? String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)) : entities[code] ?? all);

/** Kleiner, strenger XML-Leser (ohne DTD) – genug für Bankauszüge, ohne Abhängigkeit. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" }, stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gy;
  let m: RegExpExecArray | null;
  while (re.lastIndex < xml.length && (m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      const local = m[2].replace(/^.*:/, "");
      if (stack.length < 2 || top.name !== local) throw new StatementError("format");
      stack.pop();
    } else if (m[3]) {
      const node: XmlNode = { name: m[3].replace(/^.*:/, ""), attrs: {}, children: [], text: "" };
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[a[1].replace(/^.*:/, "")] = unescape(a[3] ?? a[4] ?? "");
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += unescape(m[6]);
  }
  if (re.lastIndex < xml.length || stack.length !== 1) throw new StatementError("format");
  return root;
}
const kids = (node: XmlNode | undefined, name: string) => node?.children.filter((c) => c.name === name) ?? [];
const kid = (node: XmlNode | undefined, ...path: string[]) => path.reduce<XmlNode | undefined>((n, p) => kids(n, p)[0], node);
const txt = (node: XmlNode | undefined, ...path: string[]) => kid(node, ...path)?.text.trim() ?? "";
function* walk(node: XmlNode, name: string): Generator<XmlNode> {
  for (const c of node.children) { if (c.name === name) yield c; else yield* walk(c, name); }
}
/** Name einer Partei: camt.053.001.02 (`Dbtr/Nm`) und ab .08 (`Dbtr/Pty/Nm`). */
const party = (node: XmlNode | undefined) => txt(node, "Nm") || txt(node, "Pty", "Nm");

export function parseCamt(xml: string): ParsedStatement {
  const doc = parseXml(xml);
  const entries = [...walk(doc, "Ntry")];
  if (!kid(doc, "Document") || !entries.length) throw new StatementError(kid(doc, "Document") ? "noRows" : "format");
  const transactions: BankTransaction[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const status = txt(entry, "Sts") || txt(entry, "Sts", "Cd");
    if (status && status !== "BOOK") continue; // vorgemerkte Umsätze erst nach Buchung
    const credit = txt(entry, "CdtDbtInd") === "CRDT";
    const date = isoDate(txt(entry, "BookgDt", "Dt") || txt(entry, "BookgDt", "DtTm") || txt(entry, "ValDt", "Dt") || txt(entry, "ValDt", "DtTm"));
    const entryAmount = kid(entry, "Amt"), entryRef = txt(entry, "AcctSvcrRef");
    const details = kids(kid(entry, "NtryDtls"), "TxDtls");
    // Sammelbuchungen tragen je Einzelzahlung eigene TxDtls mit eigenem Betrag.
    const parts = details.length > 1 && details.every((d) => kid(d, "Amt") || kid(d, "AmtDtls", "TxAmt", "Amt")) ? details : [details[0]];
    parts.forEach((d, index) => {
      const amountNode = parts.length > 1 ? kid(d, "Amt") || kid(d, "AmtDtls", "TxAmt", "Amt") : entryAmount;
      const currency = (amountNode?.attrs.Ccy || "EUR").toUpperCase();
      const amount = amountNode ? amountToMinor(amountNode.text.trim(), currency) : null;
      if (!date || amount === null || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) { skipped++; return; }
      const related = kid(d, "RltdPties");
      const counter = credit ? "Dbtr" : "Cdtr";
      const remittance = kid(d, "RmtInf");
      const purpose = [
        ...kids(remittance, "Ustrd").map((u) => u.text.trim()),
        ...kids(remittance, "Strd").map((s) => txt(s, "CdtrRefInf", "Ref")),
        txt(entry, "AddtlNtryInf"),
      ].filter(Boolean).join(" ");
      const e2e = txt(d, "Refs", "EndToEndId");
      transactions.push(transaction({
        date, amount_minor: amount, currency, credit,
        name: party(kid(related, counter)) || party(kid(related, credit ? "UltmtDbtr" : "UltmtCdtr")),
        iban: txt(related, `${counter}Acct`, "Id", "IBAN"),
        purpose: e2e && e2e !== "NOTPROVIDED" ? `${purpose} ${e2e}` : purpose,
      }, `${entryRef}|${txt(d, "Refs", "AcctSvcrRef")}|${txt(d, "Refs", "TxId")}|${index}`));
    });
  }
  return { format: "camt", transactions, skipped };
}

// ---------------------------------------------------------------- CSV deutscher Banken

const header = (value: string) => fold(value).replace(/[^a-z0-9]/g, "");
// Spaltennamen gängiger Exporte (Sparkasse CSV-CAMT, Volksbank, Deutsche Bank,
// Commerzbank, ING, DKB, Postbank, N26, Kontist, Qonto, englische Exporte).
const COLUMNS = {
  date: ["buchungstag", "buchungsdatum", "buchung", "datum", "bookingdate", "date", "valutadatum", "valuta", "wertstellung", "wertstellungsdatum", "valuedate", "settlementdate"],
  amount: ["betrag", "betrageur", "umsatz", "umsatzineur", "betragineur", "amount", "amounteur", "betragwahrung", "betragzahlungsauftrag"],
  credit: ["haben", "gutschrift", "eingang", "credit", "habenbetrag"],
  debit: ["soll", "lastschrift", "ausgang", "debit", "sollbetrag"],
  sign: ["sollhaben", "sh", "debitcredit"],
  currency: ["wahrung", "waehrung", "currency", "whrg"],
  name: ["beguenstigterzahlungspflichtiger", "zahlungspflichtiger", "zahlungspflichtige", "begunstigterzahlungspflichtiger", "namezahlungsbeteiligter", "auftraggeberempfanger", "auftraggeberbegunstigter", "zahlungspflichtigerempfanger", "zahlungsempfangerin", "zahlungsempfanger", "empfanger", "auftraggeber", "gegenpartei", "counterparty", "payee", "name", "partnername", "beteiligter"],
  iban: ["kontonummeriban", "ibanzahlungsbeteiligter", "iban", "kontonummer", "gegenkontoiban", "partneriban", "accountnumber", "counterpartyiban"],
  purpose: ["verwendungszweck", "buchungsdetails", "zahlungsreferenz", "reference", "paymentreference", "description", "beschreibung", "vorgangverwendungszweck", "mitteilung", "purpose"],
  status: ["status", "buchungsstatus", "state"],
  ref: ["kundenreferenzendtoend", "endtoendreferenz", "endtoendid", "bankreferenz", "transactionid", "referenz", "mandatsreferenz"],
} as const;
type Column = keyof typeof COLUMNS;

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}
function findColumn(names: string[], column: Column, taken: Set<number>): number {
  const candidates = COLUMNS[column] as readonly string[];
  for (const wanted of candidates) {
    const index = names.findIndex((n, i) => !taken.has(i) && n === wanted);
    if (index >= 0) return index;
  }
  for (const wanted of candidates) {
    if (wanted.length < 5) continue;
    const index = names.findIndex((n, i) => !taken.has(i) && n.startsWith(wanted));
    if (index >= 0) return index;
  }
  return -1;
}

export function parseBankCsv(text: string): ParsedStatement {
  const firstLines = text.split(/\r?\n/).slice(0, 30).join("\n");
  const delimiter = [";", "\t", ","].map((d) => [d, firstLines.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = splitCsv(text, delimiter);
  // Viele Banken setzen Kontoinformationen über die Kopfzeile – die erste Zeile mit Datum und Betrag gewinnt.
  let headerRow = -1, map: Partial<Record<Column, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 40) && headerRow < 0; r++) {
    const names = rows[r].map(header), taken = new Set<number>(), found: Partial<Record<Column, number>> = {};
    for (const column of Object.keys(COLUMNS) as Column[]) {
      const index = findColumn(names, column, taken);
      if (index >= 0) { found[column] = index; taken.add(index); }
    }
    if (found.date !== undefined && (found.amount !== undefined || found.credit !== undefined)) { headerRow = r; map = found; }
  }
  if (headerRow < 0) throw new StatementError("format");
  const transactions: BankTransaction[] = [];
  let skipped = 0;
  const get = (row: string[], column: Column) => (map[column] === undefined ? "" : (row[map[column]!] ?? "").trim());
  for (const row of rows.slice(headerRow + 1)) {
    const date = isoDate(get(row, "date"));
    if (/vorgemerkt|pending|offen/.test(fold(get(row, "status")))) continue; // erst gebuchte Umsätze
    const currency = (get(row, "currency").toUpperCase().match(/^[A-Z]{3}$/)?.[0]) || "EUR";
    let amount: number | null;
    if (map.amount !== undefined) {
      amount = amountToMinor(get(row, "amount"), currency);
      const sign = fold(get(row, "sign"));
      if (amount !== null && (sign === "s" || sign === "soll" || sign === "d" || sign === "debit")) amount = -Math.abs(amount);
    } else {
      const credit = amountToMinor(get(row, "credit"), currency), debit = amountToMinor(get(row, "debit"), currency);
      amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : null;
    }
    if (!date || amount === null || amount === 0) { if (row.some((v) => v.trim())) skipped++; continue; }
    transactions.push(transaction({
      date, amount_minor: Math.abs(amount), currency, credit: amount > 0,
      name: get(row, "name"), iban: get(row, "iban"),
      purpose: [get(row, "purpose"), get(row, "ref")].filter(Boolean).join(" "),
    }, get(row, "ref")));
  }
  if (!transactions.length) throw new StatementError("noRows");
  return { format: "csv", transactions, skipped };
}

// ---------------------------------------------------------------- Zuordnung

export const BANK_REF = /\bref:([0-9a-z]{12})\b/;
/** Notiz der gebuchten Zahlung (max. 500 Zeichen) mit der Bankreferenz für den Doppelbuchungsschutz. */
export function paymentNote(tx: BankTransaction, label: string): string {
  const tail = ` · ref:${tx.key}`;
  return `${label}${tx.name ? ` · ${tx.name}` : ""}${tx.purpose ? ` · ${tx.purpose}` : ""}`.slice(0, 500 - tail.length) + tail;
}
export function bookedRefs(invoices: readonly Invoice[]): Set<string> {
  const refs = new Set<string>();
  for (const invoice of invoices) for (const p of invoice.payments ?? []) {
    const m = p.note.match(BANK_REF);
    if (m) refs.add(m[1]);
  }
  return refs;
}
/** Offener Rest einer ausgestellten, nicht stornierten Rechnung. */
export function openAmount(invoice: Invoice): number {
  if (invoice.status !== "issued" || invoice.paid || invoice.cancellation_id) return 0;
  return Math.max(0, invoice.total_minor - (invoice.paid_minor ?? 0));
}
const compact = (value: string) => fold(value).replace(/[^a-z0-9]/g, "");
/** Rechnungsnummer im Verwendungszweck – unempfindlich gegen Leer-, Binde- und Schrägstriche, nicht als Teil einer längeren Nummer. */
export function mentionsNumber(purpose: string, number: string | null): boolean {
  const n = compact(number || "");
  if (n.length < 3) return false;
  const p = compact(purpose);
  let at = p.indexOf(n);
  while (at >= 0) {
    const before = p[at - 1] ?? "", after = p[at + n.length] ?? "";
    // „RE-2026-001“ darf nicht in „RE-2026-0012“ gefunden werden.
    if (!(/\d/.test(n[n.length - 1]) && /\d/.test(after)) && !(/\d/.test(n[0]) && /\d/.test(before))) return true;
    at = p.indexOf(n, at + 1);
  }
  return false;
}
const STOP = new Set(["gmbh", "mbh", "ag", "kg", "ug", "co", "und", "the", "ltd", "inc", "llc", "ohg", "gbr", "ev", "haftungsbeschrankt", "se", "sarl", "bv"]);
const words = (value: string) => new Set(fold(value).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
/** Anteil der Kundennamens-Wörter, die im Namen oder Zweck der Buchung vorkommen. */
export function nameScore(clientName: string, tx: BankTransaction): number {
  const client = words(clientName);
  if (!client.size) return 0;
  const seen = words(`${tx.name} ${tx.purpose}`);
  return [...client].filter((w) => seen.has(w)).length / client.size;
}

interface Candidate { invoice: Invoice; score: number; reasons: MatchReason[] }
function score(tx: BankTransaction, invoice: Invoice, clientName: string): Candidate | null {
  const open = openAmount(invoice);
  if (!open || invoice.currency !== tx.currency) return null;
  const reasons: MatchReason[] = [];
  let points = 0;
  const number = mentionsNumber(tx.purpose, invoice.number);
  if (number) { points += 60; reasons.push("number"); }
  if (tx.amount_minor === open) { points += 30; reasons.push("amount"); }
  else if (tx.amount_minor === invoice.total_minor && open !== invoice.total_minor) { points += 10; }
  else if (tx.amount_minor < open) { if (number) { points += 5; reasons.push("partial"); } }
  else if (number) reasons.push("overpaid");
  const name = nameScore(clientName, tx);
  if (name >= 0.5) { points += Math.round(20 * name); reasons.push("name"); }
  if (invoice.issue_date && tx.date < invoice.issue_date) { points -= 25; reasons.push("early"); }
  // Ohne Nummer braucht es Betrag UND Name; ein gleicher Betrag allein ist zu schwach.
  if (!number && !(reasons.includes("amount") && reasons.includes("name"))) return null;
  return points > 0 ? { invoice, score: points, reasons } : null;
}
const confidence = (points: number): MatchConfidence => (points >= 80 ? "high" : points >= 45 ? "medium" : "low");

/**
 * Ordnet jede Gutschrift höchstens einer Rechnung zu. Paare mit dem höchsten
 * Wert gehen zuerst; mehrere Eingänge dürfen dieselbe Rechnung treffen,
 * solange der offene Rest reicht (Teilzahlungen). Lastschriften bleiben außen vor.
 */
export function matchTransactions(
  transactions: readonly BankTransaction[],
  invoices: readonly Invoice[],
  clientNameOf: (invoice: Invoice) => string,
): MatchProposal[] {
  const refs = bookedRefs(invoices);
  const credits = transactions.filter((t) => t.credit);
  const open = new Map(invoices.filter((i) => openAmount(i) > 0).map((i) => [i.id, i] as const));
  const pairs: { tx: number; c: Candidate }[] = [];
  credits.forEach((tx, index) => {
    if (refs.has(tx.key)) return;
    for (const invoice of open.values()) {
      const c = score(tx, invoice, clientNameOf(invoice));
      if (c) pairs.push({ tx: index, c });
    }
  });
  pairs.sort((a, b) => b.c.score - a.c.score || credits[a.tx].date.localeCompare(credits[b.tx].date));
  const remaining = new Map([...open.values()].map((i) => [i.id, openAmount(i)] as const));
  const chosen = new Map<number, Candidate>();
  for (const { tx, c } of pairs) {
    if (chosen.has(tx) || (remaining.get(c.invoice.id) ?? 0) <= 0) continue;
    // Ein zweiter Eingang auf dieselbe Rechnung zählt nur mit Rechnungsnummer.
    if (remaining.get(c.invoice.id)! < openAmount(c.invoice) && !c.reasons.includes("number")) continue;
    chosen.set(tx, c);
    remaining.set(c.invoice.id, remaining.get(c.invoice.id)! - credits[tx].amount_minor);
  }
  const before = new Map([...open.values()].map((i) => [i.id, openAmount(i)] as const));
  return credits.map((tx, index) => {
    const booked = refs.has(tx.key);
    const c = chosen.get(index);
    if (!c) return { transaction: tx, invoiceId: null, amount_minor: tx.amount_minor, confidence: null, reasons: [], booked };
    const left = before.get(c.invoice.id)!;
    before.set(c.invoice.id, Math.max(0, left - tx.amount_minor));
    const reasons = tx.amount_minor > left && !c.reasons.includes("overpaid") ? [...c.reasons, "overpaid" as const] : c.reasons;
    // Doppelt aus einem anderen Format eingelesen? Gleicher Tag und Betrag schon erfasst.
    const duplicate = (c.invoice.payments ?? []).some((p) => p.paid_on === tx.date && p.amount_minor === Math.min(tx.amount_minor, left));
    return {
      transaction: tx,
      invoiceId: c.invoice.id,
      amount_minor: Math.min(tx.amount_minor, left),
      confidence: duplicate ? "low" : confidence(c.score),
      reasons: duplicate ? [...reasons, "duplicate"] : reasons,
      booked,
    };
  });
}
