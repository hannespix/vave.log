import { useState, type ChangeEvent, type FormEvent } from "react";
import { FileUp } from "lucide-react";
import type { Invoice } from "../../shared/finance-types";
import { Dialog, Notice } from "../components";
import { SelectMenu, type SelectOption } from "../select-menu";
import {
  StatementError, decodeStatement, matchTransactions, openAmount, parseStatement, paymentNote,
  type MatchConfidence, type MatchProposal, type MatchReason, type ParsedStatement,
} from "./bank-import";
import type { FinanceKey } from "./catalog";
import { useFinance } from "./context";
import { decimalToMinor, displayDate, minorInput, money } from "./documents";

const MAX_BYTES = 10 * 1024 * 1024;
const CONFIDENCE: Record<MatchConfidence, { key: FinanceKey; badge: string }> = {
  high: { key: "bankConfHigh", badge: "badge-approved" },
  medium: { key: "bankConfMedium", badge: "badge-submitted" },
  low: { key: "bankConfLow", badge: "badge-draft" },
};
const REASON: Record<MatchReason, FinanceKey> = {
  number: "bankReasonNumber", amount: "bankReasonAmount", name: "bankReasonName", partial: "bankReasonPartial",
  overpaid: "bankReasonOverpaid", early: "bankReasonEarly", duplicate: "bankReasonDuplicate",
};
interface Row { invoiceId: string; amount: string; use: boolean }

/** Kontoauszug einlesen, Vorschläge prüfen, bestätigte Eingänge als Zahlungen buchen. */
export function BankReconcileDialog({ onClose }: { onClose: () => void }) {
  const { t, data, locale, workspace, service, run, busy, errorMessage } = useFinance();
  const [statement, setStatement] = useState<ParsedStatement | null>(null),
    [proposals, setProposals] = useState<MatchProposal[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [fileError, setFileError] = useState(""),
    [rowError, setRowError] = useState(""),
    [done, setDone] = useState<number | null>(null),
    [partial, setPartial] = useState(0);
  const clientName = (i: Invoice) => i.customer_snapshot?.name || data.clients.find((c) => c.id === i.client_id)?.name || "";
  const open = data.invoices.filter((i) => openAmount(i) > 0);
  const byId = new Map(open.map((i) => [i.id, i] as const));
  const fmt = (minor: number, currency: string) => money(minor, currency, locale);
  const options = (currency: string): SelectOption[] => [
    { value: "", label: t("bankNoMatch") },
    ...open.filter((i) => i.currency === currency).map((i) => ({
      value: i.id,
      label: `${i.number} · ${clientName(i)}`,
      sublabel: `${t("bankOpen")} ${fmt(openAmount(i), i.currency)} · ${displayDate(i.due_date, locale)}`,
      keywords: `${i.number} ${clientName(i)} ${minorInput(openAmount(i), i.currency)}`,
    })),
  ];

  async function load(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(""); setRowError(""); setDone(null); setPartial(0);
    try {
      if (file.size > MAX_BYTES) throw new StatementError("format");
      const parsed = parseStatement(decodeStatement(new Uint8Array(await file.arrayBuffer())));
      const list = matchTransactions(parsed.transactions, data.invoices, clientName);
      setStatement(parsed);
      setProposals(list);
      setRows(list.map((p) => ({
        invoiceId: p.invoiceId ?? "",
        amount: minorInput(p.amount_minor, p.transaction.currency),
        use: !p.booked && p.confidence === "high",
      })));
    } catch (error) {
      setStatement(null);
      const code = error instanceof StatementError ? error.code : "format";
      setFileError(t(code === "empty" ? "bankErrorEmpty" : code === "noRows" ? "bankErrorNoRows" : "bankErrorFormat"));
    }
  }
  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  function choose(index: number, invoiceId: string) {
    const tx = proposals[index].transaction, invoice = byId.get(invoiceId);
    update(index, {
      invoiceId,
      use: Boolean(invoice),
      amount: minorInput(invoice ? Math.min(tx.amount_minor, openAmount(invoice)) : tx.amount_minor, tx.currency),
    });
  }
  const selected = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => row.use && row.invoiceId && !proposals[index].booked);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRowError("");
    let payments: { invoice_id: string; paid_on: string; amount_minor: number; note: string }[];
    try {
      payments = selected.map(({ row, index }) => {
        const tx = proposals[index].transaction;
        const amount = decimalToMinor(row.amount.replace(",", "."), tx.currency);
        if (amount < 1 || amount > tx.amount_minor) throw new Error("amount");
        return { invoice_id: row.invoiceId, paid_on: tx.date, amount_minor: amount, note: paymentNote(tx, t("bankNote")) };
      });
    } catch {
      setRowError(t("bankErrorAmount"));
      return;
    }
    setPartial(0);
    let count = 0;
    void run(async () => {
      // Nacheinander: jede Zahlung sperrt ihre Rechnung; bei einem Fehler bleibt der Rest offen.
      for (const payment of payments) {
        await service.recordPayment({ workspace_id: workspace.id, ...payment });
        count++;
      }
    }, () => setDone(payments.length)).then((ok) => { if (!ok) setPartial(count); });
  }

  const credits = proposals.length;
  const matched = proposals.filter((p) => p.invoiceId).length;
  const already = proposals.filter((p) => p.booked).length;
  const debits = statement ? statement.transactions.length - credits : 0;
  return (
    <Dialog title={t("bankImport")} onClose={onClose} busy={busy} wide>
      <form className="form-stack" onSubmit={submit}>
        <Notice kind="info">{t("bankImportHint")}</Notice>
        <div className="bank-file">
          <input type="file" accept=".xml,.camt,.csv,.txt,text/csv,application/xml,text/xml" className="sr-only" id="bank-file" onChange={(e) => void load(e)} disabled={busy} />
          <label htmlFor="bank-file" className="button secondary">
            <FileUp size={17} aria-hidden="true" />
            {t(statement ? "bankOtherFile" : "bankFile")}
          </label>
          <small>{t("bankFormats")}</small>
        </div>
        {fileError && <Notice>{fileError}</Notice>}
        {done !== null && <Notice kind="success">{t("bankDone").replace("{n}", String(done))}</Notice>}
        {errorMessage && partial > 0 && <Notice>{t("bankPartialFailure").replace("{n}", String(partial))}</Notice>}
        {statement && (
          <>
            <p className="bank-summary" aria-live="polite">
              <strong>{credits}</strong> {t("bankCredits")} · <strong>{matched}</strong> {t("bankProposals")}
              {already > 0 && <> · <strong>{already}</strong> {t("bankBooked")}</>}
              {debits > 0 && <> · {debits} {t("bankDebits")}</>}
              {statement.skipped > 0 && <> · {statement.skipped} {t("bankSkipped")}</>}
            </p>
            {credits === 0 ? <p className="muted">{t("bankNoCredits")}</p> : (
              <ul className="bank-rows">
                {proposals.map((p, index) => {
                  const tx = p.transaction, row = rows[index], confidence = p.confidence && CONFIDENCE[p.confidence];
                  return (
                    <li key={tx.key + index} className={p.booked ? "bank-row bank-row-booked" : row.use && row.invoiceId ? "bank-row bank-row-use" : "bank-row"}>
                      <label className="checkbox-field bank-use">
                        <input type="checkbox" checked={row.use && !p.booked} disabled={p.booked || !row.invoiceId || busy} onChange={(e) => update(index, { use: e.target.checked })} />
                        <span className="sr-only">{t("bankUse")}: {tx.name} {fmt(tx.amount_minor, tx.currency)}</span>
                      </label>
                      <div className="bank-tx">
                        <strong>{fmt(tx.amount_minor, tx.currency)}</strong>
                        <span>{displayDate(tx.date, locale)}{tx.name && ` · ${tx.name}`}</span>
                        {tx.purpose && <small title={tx.purpose}>{tx.purpose}</small>}
                      </div>
                      {p.booked ? <span className="badge badge-done bank-booked">{t("bankAlreadyBooked")}</span> : (
                        <div className="bank-assign">
                          <SelectMenu
                            label={t("invoice")}
                            value={row.invoiceId}
                            onChange={(value) => choose(index, value)}
                            options={options(tx.currency)}
                            searchable
                            compact
                            disabled={busy}
                          />
                          <label className="bank-amount">
                            <span className="sr-only">{t("bankAmount")}</span>
                            <input inputMode="decimal" value={row.amount} disabled={!row.invoiceId || busy} aria-label={t("bankAmount")} onChange={(e) => update(index, { amount: e.target.value })} />
                          </label>
                          {confidence && row.invoiceId === (p.invoiceId ?? "") && (
                            <p className="bank-why">
                              <span className={`badge ${confidence.badge}`}>{t(confidence.key)}</span>
                              <small>{p.reasons.map((r) => t(REASON[r])).join(" · ")}</small>
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {rowError && <Notice>{rowError}</Notice>}
        {errorMessage && !partial && <Notice>{errorMessage}</Notice>}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t("close")}</button>
          {statement && credits > 0 && done === null && (
            <button type="submit" className="button primary" disabled={busy || !selected.length}>
              {t("bankBookN").replace("{n}", String(selected.length))}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
