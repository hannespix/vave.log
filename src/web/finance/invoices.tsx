import { useRef, useState, type FormEvent } from "react";
import { Plus, ArrowDownToLine, Printer, Trash2 } from "lucide-react";
import type {
  Invoice,
  InvoiceLanguage,
  InvoiceLineInput,
} from "../../shared/finance-types";
import { lineTotals, roundRatio } from "../../shared/finance-math";
import { Dialog, Empty, Field, Notice } from "../components";
import {
  Actions,
  ClientSelect,
  FinanceProjectFilter,
  LanguageSelect,
  ProjectLink,
  ProjectSelect,
  Section,
  formText,
  useFinance,
  useFinanceProject,
} from "./context";
import {
  currencyDigits,
  decimalToMinor,
  displayDate,
  invoiceCsv,
  isDemoInvoice,
  minorInput,
  money,
  printInvoice,
} from "./documents";
import { downloadText } from "../helpers";
export function Invoices() {
  const { data, t, locale, workspace, isDemo } = useFinance(),
    { projectId, setProjectId, available } = useFinanceProject(),
    [editor, setEditor] = useState<Invoice | "new" | "time" | null>(null),
    [selected, setSelected] = useState("");
  const invoices = data.invoices.filter((item) => available && (!projectId || item.project_id === projectId));
  const invoice = invoices.find((i) => i.id === selected);
  return (
    <div className="finance-stack">
      <Section
        title="invoices"
        action={
          <div className="button-row">
            <button
              className="button secondary small"
              disabled={!data.clients.length || !available}
              onClick={() => setEditor("time")}
            >
              {t("timeInvoice")}
            </button>
            <button
              className="button primary small"
              disabled={!data.clients.length || !available}
              onClick={() => setEditor("new")}
            >
              <Plus size={16} />
              {t("newInvoice")}
            </button>
          </div>
        }
      >
        <FinanceProjectFilter projectId={projectId} onChange={setProjectId} />
        {!data.clients.length && (
          <Notice kind="info">{t("clientsHint")}</Notice>
        )}
        {invoices.length === 0 ? (
          <Empty title={t(available ? "noInvoices" : "projectUnavailable")} text={t("noSend")} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("number")}</th>
                  <th>{t("clients")}</th>
                  <th>{t("issueDate")}</th>
                  <th>{t("total")}</th>
                  <th>{t("invoice")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={
                      selected === invoice.id ? "finance-selected" : ""
                    }
                  >
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(invoice.id)}
                      >
                        {invoice.number || t("draft")}
                      </button>
                      <small className="mono finance-id">
                        {invoice.id.slice(0, 8)}
                      </small>
                      {isDemoInvoice(invoice, { isDemo }) && <small>{t("demoMark")}</small>}
                    </td>
                    <td>
                      {invoice.customer_snapshot?.name ||
                        data.clients.find((c) => c.id === invoice.client_id)
                          ?.name}
                      {invoice.project_id && <small><ProjectLink projectId={invoice.project_id} /></small>}
                    </td>
                    <td>{displayDate(invoice.issue_date, locale)}</td>
                    <td>
                      {money(
                        invoice.total_minor,
                        invoice.currency || workspace.currency,
                        locale,
                      )}
                    </td>
                    <td>
                      <span
                        className={`finance-status finance-status-${invoice.status}`}
                      >
                        {t(
                          invoice.status === "cancellation"
                            ? "cancellation"
                            : invoice.status,
                        )}
                      </span>
                      {invoice.status === "issued" && (
                        <small>{t(invoice.paid ? "paid" : "unpaid")}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {invoice && (
        <InvoiceDetail
          invoice={invoice}
          onEdit={() => setEditor(invoice)}
          onSelect={setSelected}
        />
      )}
      {available && (editor === "time" ? (
        <TimeDraft onClose={() => setEditor(null)} onSaved={setSelected} />
      ) : (
        editor && (
          <DraftEditor
            invoice={editor === "new" ? undefined : editor}
            onClose={() => setEditor(null)}
            onSaved={setSelected}
          />
        )
      ))}
    </div>
  );
}
function InvoiceDetail({
  invoice,
  onEdit,
  onSelect,
}: {
  invoice: Invoice;
  onEdit: () => void;
  onSelect: (id: string) => void;
}) {
  const { data, locale, workspace, t, run, service, busy, isDemo } =
      useFinance(),
    [confirm, setConfirm] = useState<"issue" | "cancel" | "paid" | null>(null);
  const demo = isDemoInvoice(invoice, { isDemo });
  const draft = invoice.status === "draft",
    customer = draft
      ? data.clients.find((c) => c.id === invoice.client_id)
      : invoice.customer_snapshot,
    issuer = draft ? data.profile : invoice.issuer_snapshot;
  function action(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      async () => {
        if (confirm === "issue")
          await service.issueInvoice(workspace.id, invoice.id);
        else if (confirm === "cancel") {
          const cancellation = await service.cancelInvoice(
            workspace.id,
            invoice.id,
            formText(f, "reason"),
          );
          onSelect(cancellation.id);
        } else
          await service.setInvoicePaid(workspace.id, invoice.id, !invoice.paid);
      },
      () => setConfirm(null),
    );
  }
  return (
    <Section
      title={invoice.status === "cancellation" ? "cancellation" : "invoice"}
      action={
        <div className="button-row">
          <button
            className="button secondary small"
            onClick={() =>
              printInvoice(invoice, {
                profile: data.profile,
                customer: data.clients.find((c) => c.id === invoice.client_id),
                isDemo,
              })
            }
          >
            <Printer size={15} />
            {t("print")}
          </button>
          <button
            className="button secondary small"
            onClick={() =>
              downloadText(
                `invoice-${invoice.number || invoice.id}.csv`,
                invoiceCsv(invoice, { isDemo }),
              )
            }
          >
            <ArrowDownToLine size={15} />
            {t("csv")}
          </button>
        </div>
      }
    >
      {demo && <Notice kind="info">{t("demoMark")}</Notice>}
      {draft && <div className="finance-draft-banner">{t("draftMark")}</div>}
      <div className="finance-invoice-header">
        <div>
          <h3>{invoice.number || t("draft")}</h3>
          <small className="mono finance-id">{invoice.id}</small>
        </div>
        <strong>{money(invoice.total_minor, invoice.currency, locale)}</strong>
      </div>
      <div className="finance-invoice-parties">
        <div>
          <h3>{issuer?.legal_name || t("company")}</h3>
          <p className="finance-prewrap muted">
            {issuer?.billing_address || "–"}
          </p>
        </div>
        <div>
          <h3>{customer?.name || t("clients")}</h3>
          <p className="finance-prewrap muted">
            {customer?.billing_address || "–"}
          </p>
        </div>
      </div>
      <dl className="finance-details">
        {invoice.project_id && <div>
          <dt>{t("project")}</dt>
          <dd><ProjectLink projectId={invoice.project_id} /></dd>
        </div>}
        <div>
          <dt>{t("issueDate")}</dt>
          <dd>{displayDate(invoice.issue_date, locale)}</dd>
        </div>
        <div>
          <dt>{t("dueDate")}</dt>
          <dd>{displayDate(invoice.due_date, locale)}</dd>
        </div>
        <div>
          <dt>{t("serviceFrom")}</dt>
          <dd>{displayDate(invoice.service_from, locale)}</dd>
        </div>
        <div>
          <dt>{t("serviceTo")}</dt>
          <dd>{displayDate(invoice.service_to, locale)}</dd>
        </div>
        <div>
          <dt>{t("language")}</dt>
          <dd>
            {invoice.language === "de"
              ? "Deutsch"
              : invoice.language === "zh"
                ? "简体中文"
                : "English"}
          </dd>
        </div>
      </dl>
      {invoice.cancellation_of && (
        <p>
          <span>{t("original")}: </span>
          <button
            className="text-button mono"
            onClick={() => onSelect(invoice.cancellation_of!)}
          >
            {data.invoices.find((i) => i.id === invoice.cancellation_of)
              ?.number || invoice.cancellation_of}
          </button>
        </p>
      )}
      {invoice.cancellation_id && (
        <p>
          <span>{t("cancellationLink")}: </span>
          <button
            className="text-button mono"
            onClick={() => onSelect(invoice.cancellation_id!)}
          >
            {data.invoices.find((i) => i.id === invoice.cancellation_id)
              ?.number || invoice.cancellation_id}
          </button>
        </p>
      )}
      {invoice.cancellation_reason && (
        <p className="finance-prewrap">{invoice.cancellation_reason}</p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("description")}</th>
              <th>{t("quantity")}</th>
              <th>{t("unitPrice")}</th>
              <th>{t("taxRate")}</th>
              <th>{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={`${line.time_entry_id || "manual"}-${index}`}>
                <td>
                  {line.description}
                  <small>{line.zero_tax_reason}</small>
                </td>
                <td>
                  {new Intl.NumberFormat(locale, {
                    maximumFractionDigits: 4,
                  }).format(line.quantity)}
                </td>
                <td>
                  {money(line.unit_price_minor, invoice.currency, locale)}
                </td>
                <td>
                  {new Intl.NumberFormat(locale, {
                    maximumFractionDigits: 2,
                  }).format(line.tax_basis_points / 100)}{" "}
                  %
                </td>
                <td>{money(line.total_minor, invoice.currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="finance-details finance-invoice-totals">
        <div>
          <dt>{t("net")}</dt>
          <dd>{money(invoice.net_minor, invoice.currency, locale)}</dd>
        </div>
        <div>
          <dt>{t("tax")}</dt>
          <dd>{money(invoice.tax_minor, invoice.currency, locale)}</dd>
        </div>
        <div>
          <dt>{t("total")}</dt>
          <dd>{money(invoice.total_minor, invoice.currency, locale)}</dd>
        </div>
      </dl>
      {invoice.notes && <p className="finance-prewrap">{invoice.notes}</p>}
      {invoice.payment_instructions && (
        <>
          <h3>{t("payment")}</h3>
          <p className="finance-prewrap muted">
            {invoice.payment_instructions}
          </p>
        </>
      )}
      <p className="finance-caption">{t("pdfNote")}</p>
      <p className="finance-caption">{t("noSend")}</p>
      <div className="button-row">
        {draft ? (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={onEdit}
            >
              {t("edit")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => setConfirm("issue")}
            >
              {t(demo ? "demoIssue" : "issue")}
            </button>
          </>
        ) : invoice.status === "issued" && !invoice.cancellation_id ? (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm("paid")}
            >
              {t(invoice.paid ? "markUnpaid" : "markPaid")}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => setConfirm("cancel")}
            >
              {t("cancelInvoice")}
            </button>
          </>
        ) : null}
      </div>
      {confirm && (
        <Dialog
          title={t(
            confirm === "issue"
              ? demo ? "demoIssue" : "issue"
              : confirm === "cancel"
                ? "cancelInvoice"
                : invoice.paid
                  ? "markUnpaid"
                  : "markPaid",
          )}
          onClose={() => setConfirm(null)}
          busy={busy}
        >
          <form className="form-stack" onSubmit={action}>
            <p>
              {t(
                confirm === "issue"
                  ? demo ? "demoIssueConfirm" : "issueConfirm"
                  : confirm === "cancel"
                    ? demo ? "demoCancellationConfirm" : "cancellationConfirm"
                    : demo ? "demoPaymentConfirm" : "paymentConfirm",
              )}
            </p>
            <strong>
              {invoice.number || t("draft")} ·{" "}
              {money(invoice.total_minor, invoice.currency, locale)}
            </strong>
            {confirm === "issue" && <Notice kind="info">{t("pdfNote")}</Notice>}
            {confirm === "cancel" && (
              <Field label={t("reason")}>
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={3}
                />
              </Field>
            )}
            <Actions
              label={confirm === "issue" ? demo ? "demoIssue" : "issue" : "continue"}
              onClose={() => setConfirm(null)}
            />
          </form>
        </Dialog>
      )}
    </Section>
  );
}
type LineEdit = {
  key: string;
  description: string;
  quantity: string;
  price: string;
  tax: string;
  zeroReason: string;
  timeId: string | null;
  sourceNet?: number;
};
export function DraftEditor({
  invoice,
  onClose,
  onSaved,
}: {
  invoice?: Invoice;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t, data, workspace, locale, range, service, run, busy, isDemo, projectId } =
      useFinance(),
    id = useRef(invoice?.id || crypto.randomUUID()),
    [clientId, setClientId] = useState(
      invoice?.client_id || data.clients[0]?.id || "",
    ),
    [language, setLanguage] = useState<InvoiceLanguage>(
      invoice?.language ||
        data.clients.find(
          (c) => c.id === (invoice?.client_id || data.clients[0]?.id),
        )?.language ||
        locale,
    );
  const [lines, setLines] = useState<LineEdit[]>(
    () =>
      invoice?.lines.map((line) => ({
        key: crypto.randomUUID(),
        description: line.description,
        quantity: String(line.quantity),
        price: minorInput(line.unit_price_minor, workspace.currency),
        tax: String(line.tax_basis_points / 100),
        zeroReason: line.zero_tax_reason,
        timeId: line.time_entry_id,
        sourceNet: line.net_minor,
      })) || [
        {
          key: crypto.randomUUID(),
          description: "",
          quantity: "1",
          price: "0",
          tax: "",
          zeroReason: "",
          timeId: null,
        },
      ],
  );
  const edit = (key: string, patch: Partial<LineEdit>) =>
    setLines((old) =>
      old.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  function toInput(line: LineEdit): InvoiceLineInput {
    return {
      description: line.description,
      quantity: Number(line.quantity),
      unit_price_minor: decimalToMinor(line.price || "0", workspace.currency),
      tax_basis_points: decimalToMinor(line.tax || "0", "EUR"),
      zero_tax_reason: line.zeroReason,
      time_entry_id: line.timeId,
    };
  }
  let total: number | null = 0;
  try {
    for (const line of lines) {
      const input = toInput(line);
      total +=
        line.timeId && line.sourceNet !== undefined
          ? line.sourceNet +
            roundRatio(line.sourceNet * input.tax_basis_points, 10000)
          : lineTotals(input).total_minor;
    }
  } catch {
    total = null;
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const saved = await service.saveInvoiceDraft({
        id: id.current,
        workspace_id: workspace.id,
        client_id: clientId,
        project_id: formText(f, "project_id") || null,
        language,
        issue_date: formText(f, "issue_date"),
        due_date: formText(f, "due_date"),
        service_from: formText(f, "service_from"),
        service_to: formText(f, "service_to"),
        notes: formText(f, "notes"),
        payment_instructions: formText(f, "payment_instructions"),
        lines: lines.map(toInput),
      });
      onSaved(saved.id);
    }, onClose);
  }
  return (
    <Dialog title={t("draft")} onClose={onClose} busy={busy}>
      <form className="form-stack finance-draft-form" onSubmit={submit}>
        {(invoice ? isDemoInvoice(invoice, { isDemo }) : isDemo) && <Notice kind="info">{t("demoMark")}</Notice>}
        <div className="finance-draft-banner">{t("draftMark")}</div>
        <div className="form-grid">
          <ClientSelect
            value={clientId}
            onChange={(value) => {
              setClientId(value);
              setLanguage(
                data.clients.find((c) => c.id === value)?.language || locale,
              );
            }}
          />
          <ProjectSelect value={invoice ? invoice.project_id : projectId} optional />
          <LanguageSelect value={language} onChange={setLanguage} />
          <Field label={t("issueDate")}>
            <input
              type="date"
              name="issue_date"
              required
              defaultValue={invoice?.issue_date || range.to}
            />
          </Field>
          <Field label={t("dueDate")}>
            <input
              type="date"
              name="due_date"
              required
              defaultValue={invoice?.due_date || range.to}
            />
          </Field>
          <Field label={t("serviceFrom")}>
            <input
              type="date"
              name="service_from"
              required
              defaultValue={invoice?.service_from || range.from}
            />
          </Field>
          <Field label={t("serviceTo")}>
            <input
              type="date"
              name="service_to"
              required
              defaultValue={invoice?.service_to || range.to}
            />
          </Field>
        </div>
        {lines.map((line, index) => (
          <fieldset className="finance-line" key={line.key}>
            <legend>
              {t("invoice")} {index + 1}
            </legend>
            <div className="finance-line-heading">
              <Field label={t("description")}>
                <textarea
                  required
                  maxLength={1000}
                  rows={2}
                  value={line.description}
                  onChange={(e) =>
                    edit(line.key, { description: e.target.value })
                  }
                />
              </Field>
              <button
                type="button"
                className="icon-button"
                aria-label={`${t("remove")} ${index + 1}`}
                onClick={() =>
                  setLines((old) => old.filter((x) => x.key !== line.key))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            {line.timeId && <p className="finance-caption">{t("timeLine")}</p>}
            <div className="finance-invoice-line-values">
              <Field label={t("quantity")}>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max="1000000"
                  required
                  value={line.quantity}
                  readOnly={!!line.timeId}
                  onChange={(e) => edit(line.key, { quantity: e.target.value })}
                />
              </Field>
              <Field label={`${t("unitPrice")} (${workspace.currency})`}>
                <input
                  type="number"
                  step={10 ** -currencyDigits(workspace.currency)}
                  min="0"
                  required
                  readOnly={!!line.timeId}
                  value={line.price}
                  onChange={(e) => edit(line.key, { price: e.target.value })}
                />
              </Field>
              <Field label={t("taxRate")}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={line.tax}
                  onChange={(e) => edit(line.key, { tax: e.target.value })}
                />
              </Field>
            </div>
            {line.tax !== "" && Number(line.tax) === 0 && (
              <Field label={t("zeroReason")}>
                <input
                  maxLength={1000}
                  value={line.zeroReason}
                  onChange={(e) =>
                    edit(line.key, { zeroReason: e.target.value })
                  }
                />
              </Field>
            )}
          </fieldset>
        ))}
        <button
          className="button secondary small align-right"
          type="button"
          onClick={() =>
            setLines((old) => [
              ...old,
              {
                key: crypto.randomUUID(),
                description: "",
                quantity: "1",
                price: "0",
                tax: "",
                zeroReason: "",
                timeId: null,
              },
            ])
          }
        >
          <Plus size={16} />
          {t("addLine")}
        </button>
        <div className="finance-preview-total">
          <span>{t("total")}</span>
          <strong>{money(total, workspace.currency, locale)}</strong>
        </div>
        <p className="finance-caption">{t("serverTotals")}</p>
        <Field label={t("payment")}>
          <textarea
            name="payment_instructions"
            defaultValue={
              invoice?.payment_instructions ??
              data.profile?.payment_details ??
              ""
            }
            maxLength={2000}
            rows={3}
          />
        </Field>
        <Field label={t("notes")}>
          <textarea
            name="notes"
            defaultValue={invoice?.notes}
            maxLength={4000}
            rows={3}
          />
        </Field>
        <Actions onClose={onClose} />
      </form>
    </Dialog>
  );
}
export function TimeDraft({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t, data, workspace, locale, range, service, run, busy, projects, isDemo, projectId } =
      useFinance(),
    [tax, setTax] = useState(""),
    [language, setLanguage] = useState<InvoiceLanguage>(
      data.clients[0]?.language || locale,
    ),
    [clientId, setClientId] = useState(data.clients[0]?.id || "");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const saved = await service.draftFromTime({
        workspace_id: workspace.id,
        project_id: formText(f, "project_id"),
        client_id: clientId,
        from: formText(f, "from"),
        to: formText(f, "to"),
        language,
        issue_date: formText(f, "issue_date"),
        due_date: formText(f, "due_date"),
        tax_basis_points: decimalToMinor(tax, "EUR"),
        zero_tax_reason: formText(f, "zero_tax_reason"),
      });
      onSaved(saved.id);
    }, onClose);
  }
  return (
    <Dialog title={t("timeInvoice")} onClose={onClose} busy={busy}>
      <form className="form-stack" onSubmit={submit}>
        {isDemo && <Notice kind="info">{t("demoMark")}</Notice>}
        <Notice kind="info">{t("timeHint")}</Notice>
        <ProjectSelect value={projectId || projects[0]?.id} />
        <ClientSelect
          value={clientId}
          onChange={(value) => {
            setClientId(value);
            setLanguage(
              data.clients.find((c) => c.id === value)?.language || locale,
            );
          }}
        />
        <div className="form-grid">
          <Field label={t("from")}>
            <input type="date" name="from" defaultValue={range.from} required />
          </Field>
          <Field label={t("to")}>
            <input type="date" name="to" defaultValue={range.to} required />
          </Field>
          <Field label={t("issueDate")}>
            <input
              type="date"
              name="issue_date"
              defaultValue={range.to}
              required
            />
          </Field>
          <Field label={t("dueDate")}>
            <input
              type="date"
              name="due_date"
              defaultValue={range.to}
              required
            />
          </Field>
          <LanguageSelect value={language} onChange={setLanguage} />
          <Field label={t("taxRate")}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              required
            />
          </Field>
        </div>
        {tax !== "" && Number(tax) === 0 && (
          <Field label={t("zeroReason")}>
            <input
              name="zero_tax_reason"
              required
              minLength={3}
              maxLength={1000}
            />
          </Field>
        )}
        <Actions label="draft" onClose={onClose} />
      </form>
    </Dialog>
  );
}
