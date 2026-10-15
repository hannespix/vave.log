import { useState, type FormEvent } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import type { InvoiceLanguage, Offer, OfferLineInput } from "../../shared/finance-types";
import { lineTotals } from "../../shared/finance-math";
import { Dialog, Empty, Field, Notice } from "../components";
import { ClientSelect, LanguageSelect, useFinance } from "./context";
import { currencyDigits, decimalToMinor, displayDate, minorInput, money } from "./documents";

// Angebote: Entwurf mit freien Positionen -> versendet (Nummer + eingefrorene
// Snapshots, serverseitig) -> angenommen/abgelehnt. Ein angenommenes Angebot
// wird genau einmal in ein Projekt mit Festpreis-Plan ueberfuehrt.
const STATUS_KEY = { draft: "offerDraft", sent: "offerSent", accepted: "offerAccepted", declined: "offerDeclined" } as const;

export function Offers() {
  const { t, data, workspace, locale, service, run, busy, navigate } = useFinance();
  const [editing, setEditing] = useState<Offer | null | undefined>(undefined); // undefined = zu, null = neu
  const [codeFor, setCodeFor] = useState("");
  function projectCodeSubmit(event: FormEvent<HTMLFormElement>, offer: Offer) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    if (!code) return;
    void run(() => service.offerToProject({ workspace_id: workspace.id, offer_id: offer.id, code }), () => setCodeFor(""));
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>{t("offers")}</h3>
          <p className="muted">{t("offersIntro")}</p>
        </div>
        <button className="button primary small" disabled={busy || data.clients.length === 0} onClick={() => setEditing(null)}>
          <Plus size={15} /> {t("newOffer")}
        </button>
      </div>
      {data.offers.length === 0 ? (
        <Empty title={t("noOffers")} text={t("noOffersHint")} />
      ) : (
        <ul className="finance-offer-list">
          {data.offers.map((offer) => (
            <li key={offer.id} className="finance-offer-item">
              <div className="finance-offer-row">
                <div>
                  <strong>{offer.number || t("offerDraft")}</strong> · {offer.title}
                  <small className="finance-caption">
                    {offer.client_name} · {money(offer.total_minor, offer.currency, locale)}
                    {offer.valid_until && <> · {t("validUntil")} {displayDate(offer.valid_until, locale)}</>}
                  </small>
                </div>
                <span className={`badge badge-${offer.status === "accepted" ? "approved" : offer.status === "declined" ? "archived" : offer.status === "sent" ? "submitted" : "draft"}`}>
                  {t(STATUS_KEY[offer.status])}
                </span>
              </div>
              <div className="button-row">
                {offer.status === "draft" && (
                  <>
                    <button className="button secondary small" disabled={busy} onClick={() => setEditing(offer)}>{t("edit")}</button>
                    <button className="button secondary small" disabled={busy} title={t("sendOfferHint")} onClick={() => void run(() => service.sendOffer(workspace.id, offer.id))}><Send size={14} /> {t("sendOffer")}</button>
                  </>
                )}
                {offer.status === "sent" && (
                  <>
                    <button className="button secondary small" disabled={busy} onClick={() => void run(() => service.decideOffer(workspace.id, offer.id, true))}>{t("acceptOffer")}</button>
                    <button className="button secondary small" disabled={busy} onClick={() => void run(() => service.decideOffer(workspace.id, offer.id, false))}>{t("declineOffer")}</button>
                  </>
                )}
                {offer.status === "accepted" && !offer.project_id && (codeFor === offer.id ? (
                  <form className="finance-inline-form" onSubmit={(event) => projectCodeSubmit(event, offer)}>
                    <Field label={t("projectCode")}>
                      <input name="code" required maxLength={24} placeholder="VAV-002" />
                    </Field>
                    <button className="button primary small" disabled={busy}>{t("offerToProject")}</button>
                    <button className="button secondary small" type="button" disabled={busy} onClick={() => setCodeFor("")}>{t("cancel")}</button>
                  </form>
                ) : (
                  <button className="button secondary small" disabled={busy} title={t("offerProjectHint")} onClick={() => setCodeFor(offer.id)}>{t("offerToProject")}</button>
                ))}
                {offer.project_id && (
                  <button className="button secondary small" onClick={() => navigate?.({ view: "projects", projectId: offer.project_id! })}>{t("offerProjectLinked")} ↗</button>
                )}
                {(offer.status === "draft" || offer.status === "declined") && (
                  <button className="button secondary small" disabled={busy} onClick={() => void run(() => service.deleteOffer(workspace.id, offer.id))}><Trash2 size={14} /> {t("deleteOffer")}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && <OfferEditor offer={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </section>
  );
}

type LineEdit = { key: string; description: string; quantity: string; price: string; tax: string; zeroReason: string };
const emptyLine = (): LineEdit => ({ key: crypto.randomUUID(), description: "", quantity: "1", price: "0", tax: "", zeroReason: "" });

function OfferEditor({ offer, onClose }: { offer?: Offer; onClose: () => void }) {
  const { t, data, workspace, locale, service, run, busy } = useFinance();
  const [clientId, setClientId] = useState(offer?.client_id || data.clients[0]?.id || "");
  const [language, setLanguage] = useState<InvoiceLanguage>(offer?.language || data.clients.find((c) => c.id === (offer?.client_id || data.clients[0]?.id))?.language || locale);
  const [lines, setLines] = useState<LineEdit[]>(() =>
    offer?.lines.map((line) => ({ key: crypto.randomUUID(), description: line.description, quantity: String(line.quantity), price: minorInput(line.unit_price_minor, workspace.currency), tax: String(line.tax_basis_points / 100), zeroReason: line.zero_tax_reason })) || [emptyLine()],
  );
  const edit = (key: string, patch: Partial<LineEdit>) => setLines((old) => old.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  function toInput(line: LineEdit): OfferLineInput {
    return { description: line.description, quantity: Number(line.quantity), unit_price_minor: decimalToMinor(line.price || "0", workspace.currency), tax_basis_points: decimalToMinor(line.tax || "0", "EUR"), zero_tax_reason: line.zeroReason };
  }
  let total: number | null = 0;
  try { for (const line of lines) total += lineTotals({ ...toInput(line), time_entry_id: null }).total_minor; } catch { total = null; }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void run(() => service.saveOffer({
      id: offer?.id,
      workspace_id: workspace.id,
      client_id: clientId,
      title: String(f.get("title") || "").trim(),
      language,
      valid_until: String(f.get("valid_until") || "") || null,
      notes: String(f.get("notes") || "").trim(),
      lines: lines.map(toInput),
    }), onClose);
  }
  return (
    <Dialog title={t("newOffer")} onClose={onClose} busy={busy}>
      <form className="form-stack finance-draft-form" onSubmit={submit}>
        <Field label={t("offerTitle")}>
          <input name="title" required maxLength={240} defaultValue={offer?.title} />
        </Field>
        <div className="form-grid">
          <ClientSelect value={clientId} onChange={(value) => { setClientId(value); setLanguage(data.clients.find((c) => c.id === value)?.language || locale); }} />
          <LanguageSelect value={language} onChange={setLanguage} />
          <Field label={t("validUntil")}>
            <input type="date" name="valid_until" min="2000-01-01" max="2100-12-31" defaultValue={offer?.valid_until || ""} />
          </Field>
        </div>
        {lines.map((line, index) => (
          <fieldset className="finance-line" key={line.key}>
            <legend>{t("position")} {index + 1}</legend>
            <div className="finance-line-heading">
              <Field label={t("description")}>
                <textarea required maxLength={1000} rows={2} value={line.description} onChange={(e) => edit(line.key, { description: e.target.value })} />
              </Field>
              <button type="button" className="icon-button" aria-label={`${t("remove")} ${index + 1}`} onClick={() => setLines((old) => old.filter((x) => x.key !== line.key))}>
                <Trash2 size={15} />
              </button>
            </div>
            <div className="finance-invoice-line-values">
              <Field label={t("quantity")}>
                <input type="number" step="0.0001" min="0.0001" max="1000000" required value={line.quantity} onChange={(e) => edit(line.key, { quantity: e.target.value })} />
              </Field>
              <Field label={`${t("unitPrice")} (${workspace.currency})`}>
                <input type="number" step={10 ** -currencyDigits(workspace.currency)} min="0" required value={line.price} onChange={(e) => edit(line.key, { price: e.target.value })} />
              </Field>
              <Field label={t("taxRate")}>
                <input type="number" min="0" max="100" step="0.01" required value={line.tax} onChange={(e) => edit(line.key, { tax: e.target.value })} />
              </Field>
            </div>
            {line.tax !== "" && Number(line.tax) === 0 && (
              <Field label={t("zeroReason")}>
                <input maxLength={1000} value={line.zeroReason} onChange={(e) => edit(line.key, { zeroReason: e.target.value })} />
              </Field>
            )}
          </fieldset>
        ))}
        <button className="button secondary small align-right" type="button" onClick={() => setLines((old) => [...old, emptyLine()])}>
          <Plus size={14} /> {t("addLine")}
        </button>
        <Field label={t("notes")}>
          <textarea name="notes" rows={2} maxLength={4000} defaultValue={offer?.notes} />
        </Field>
        {total !== null && <p className="finance-caption">{t("total")}: {money(total, workspace.currency, locale)}</p>}
        {data.clients.length === 0 && <Notice>{t("noOffersHint")}</Notice>}
        <div className="button-row">
          <button className="button primary" disabled={busy || !clientId}>{t("save")}</button>
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>{t("cancel")}</button>
        </div>
      </form>
    </Dialog>
  );
}
