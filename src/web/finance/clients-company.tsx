import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Globe, Mail, Pencil, Phone, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import type {
  ClientContact,
  FinanceClient,
  FinanceClientInput,
  InvoiceLanguage,
} from "../../shared/finance-types";
import { fold, initials } from "../helpers";
import { money } from "./documents";
import { openAmount } from "./bank-import";
import { Dialog, Empty, Field, Notice } from "../components";
import {
  Actions,
  LanguageSelect,
  Section,
  formText,
  useFinance,
} from "./context";
/** Live-Drift wie beim Logo: der country-Schlüssel reist nur mit, wenn der
 * Datensatz ihn kennt oder der Wert vom Standard DE abweicht — so speichert
 * auch eine Live-DB vor der E-Rechnungs-Migration. */
const normalizedCountry = (value: string) => (value.trim().toUpperCase() || "DE");
const clientCountry = (item: { country?: string } | null | undefined, value: string) => {
  const country = normalizedCountry(value);
  return item?.country === undefined && country === "DE" ? {} : { country };
};
const profileCountry = clientCountry;
/** Neue Kundenfelder reisen wie das Land nur mit, wenn der Datensatz sie kennt
 * (Migration eingespielt) oder etwas eingetragen ist – so speichert eine Live-DB
 * ohne das Update weiter die Grunddaten. */
const DETAIL_KEYS = ["customer_number", "industry", "phone", "website", "notes"] as const;
type ClientDetails = Pick<FinanceClientInput, (typeof DETAIL_KEYS)[number] | "contacts">;
export function clientDetails(item: FinanceClient | undefined, values: Required<ClientDetails>): ClientDetails {
  const known = item !== undefined && item.notes !== undefined;
  const filled = DETAIL_KEYS.some((key) => values[key] !== "") || values.contacts.length > 0;
  return known || filled ? values : {};
}
/** Website als Link: ohne Schema wird https:// ergänzt, nur http(s) zählt. */
export function websiteHref(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}
/** Multitoken-Suche über alle Kundenangaben einschließlich Ansprechpartner und Bemerkungen. */
export function clientMatches(c: FinanceClient, query: string): boolean {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = fold([c.name, c.customer_number, c.industry, c.contact_email, c.phone, c.website, c.notes, c.billing_address, c.tax_id,
    ...(c.contacts ?? []).flatMap((p) => [p.name, p.role, p.email, p.phone])].filter(Boolean).join(" "));
  return tokens.every((token) => hay.includes(token));
}
export function Clients() {
  const { data, t, locale, workspace } = useFinance(),
    [editor, setEditor] = useState<FinanceClient | "new" | null>(null),
    [query, setQuery] = useState("");
  const clients = [...data.clients].filter((c) => clientMatches(c, query)).sort((a, b) => a.name.localeCompare(b.name, locale));
  const stats = (c: FinanceClient) => {
    const issued = data.invoices.filter((i) => i.client_id === c.id && i.status === "issued" && !i.cancellation_id && i.currency === workspace.currency);
    return {
      invoices: issued.length,
      invoiced: issued.reduce((sum, i) => sum + i.total_minor, 0),
      open: issued.reduce((sum, i) => sum + openAmount(i), 0),
      projects: data.plans.filter((plan) => plan.client_id === c.id).length,
    };
  };
  return (
    <Section
      title="clients"
      action={
        <button className="button primary small" onClick={() => setEditor("new")}>
          <Plus size={16} />
          {t("newClient")}
        </button>
      }
    >
      {data.clients.length === 0 ? (
        <Empty title={t("noClients")} text={t("clientsHint")} />
      ) : (
        <>
          {data.clients.length > 1 && (
            <label className="workflow-search finance-search finance-client-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">{t("searchClients")}</span>
              <input type="search" maxLength={240} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchClients")} />
            </label>
          )}
          {clients.length === 0 ? <p className="muted">{t("noClientMatch")}</p> : (
            <div className="finance-client-grid">
              {clients.map((c) => {
                const s = stats(c), contacts = c.contacts ?? [], main = contacts[0], href = websiteHref(c.website ?? "");
                return (
                  <article className="finance-client" key={c.id}>
                    <header className="finance-client-head">
                      <span className="finance-client-avatar" aria-hidden="true">{initials(c.name)}</span>
                      <div>
                        <h3>{c.name}</h3>
                        <p className="finance-client-sub">
                          {[c.customer_number && `${t("customerNumber")} ${c.customer_number}`, c.industry].filter(Boolean).join(" · ") || " "}
                        </p>
                      </div>
                      <button className="icon-button" aria-label={`${t("edit")}: ${c.name}`} onClick={() => setEditor(c)}>
                        <Pencil size={16} />
                      </button>
                    </header>
                    <dl className="finance-client-facts">
                      <div><dt>{t("clientDocuments")}</dt><dd>{s.invoices}</dd></div>
                      <div><dt>{t("clientInvoiced")}</dt><dd>{money(s.invoiced, workspace.currency, locale)}</dd></div>
                      <div><dt>{t("clientOpen")}</dt><dd className={s.open > 0 ? "finance-client-open" : ""}>{money(s.open, workspace.currency, locale)}</dd></div>
                      <div><dt>{t("clientProjects")}</dt><dd>{s.projects}</dd></div>
                    </dl>
                    <div className="finance-client-body">
                      <section>
                        <h4>{t("contacts")}</h4>
                        {main ? (
                          <div className="finance-client-contact">
                            <strong>{main.name}</strong>
                            {main.role && <span>{main.role}</span>}
                            {main.email && <a href={`mailto:${main.email}`}><Mail size={13} aria-hidden="true" />{main.email}</a>}
                            {main.phone && <a href={`tel:${main.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} aria-hidden="true" />{main.phone}</a>}
                            {contacts.length > 1 && (
                              <small title={contacts.slice(1).map((p) => [p.name, p.role].filter(Boolean).join(", ")).join(" · ")}>
                                {t("moreContacts").replace("{n}", String(contacts.length - 1))}: {contacts.slice(1).map((p) => p.name).join(", ")}
                              </small>
                            )}
                          </div>
                        ) : <p className="muted">{t("noContacts")}</p>}
                      </section>
                      <section>
                        <h4>{t("sectionContact")}</h4>
                        <div className="finance-client-contact">
                          {c.contact_email && <a href={`mailto:${c.contact_email}`}><Mail size={13} aria-hidden="true" />{c.contact_email}</a>}
                          {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} aria-hidden="true" />{c.phone}</a>}
                          {href && <a href={href} target="_blank" rel="noopener noreferrer"><Globe size={13} aria-hidden="true" />{c.website}</a>}
                          <span className="finance-prewrap muted">{c.billing_address || "–"}</span>
                        </div>
                      </section>
                    </div>
                    {c.notes && (
                      <p className="finance-client-notes" title={c.notes}><StickyNote size={14} aria-hidden="true" /><span>{c.notes}</span></p>
                    )}
                    <div className="finance-client-meta">
                      <span>{c.language === "en" ? "English" : c.language === "de" ? "Deutsch" : "简体中文"} · {c.country ?? "DE"}</span>
                      <span>{c.tax_id}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {editor && <ClientEditor item={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
    </Section>
  );
}
interface ContactRow extends Required<ClientContact> { key: string }
const contactRow = (c?: ClientContact): ContactRow => ({ key: crypto.randomUUID(), name: c?.name ?? "", role: c?.role ?? "", email: c?.email ?? "", phone: c?.phone ?? "" });
function ClientEditor({ item, onClose }: { item?: FinanceClient; onClose: () => void }) {
  const { t, data, workspace, locale, service, run, busy } = useFinance(),
    id = useRef(item?.id || crypto.randomUUID()),
    [numberTaken, setNumberTaken] = useState(false),
    [contacts, setContacts] = useState<ContactRow[]>(() => (item?.contacts ?? []).map(contactRow)),
    [missingColumns, setMissingColumns] = useState(false);
  const update = (key: string, patch: Partial<ContactRow>) => setContacts((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const list = contacts
      .map(({ name, role, email, phone }) => ({ name: name.trim(), role: role.trim(), email: email.trim(), phone: phone.trim() }))
      .filter((c) => c.name)
      .map((c) => Object.fromEntries(Object.entries(c).filter(([key, value]) => key === "name" || value)) as unknown as ClientContact);
    const details = clientDetails(item, {
      customer_number: formText(f, "customer_number"),
      industry: formText(f, "industry"),
      phone: formText(f, "phone"),
      website: formText(f, "website"),
      notes: formText(f, "notes"),
      contacts: list,
    });
    setMissingColumns(false);
    const number = details.customer_number ?? "";
    const taken = Boolean(number) && data.clients.some((c) => c.id !== id.current && c.customer_number === number);
    setNumberTaken(taken);
    if (taken) return;
    void run(
      () =>
        service.saveClient({
          id: id.current,
          workspace_id: workspace.id,
          name: formText(f, "name"),
          billing_address: formText(f, "billing_address"),
          contact_email: formText(f, "contact_email"),
          tax_id: formText(f, "tax_id"),
          language: formText(f, "language") as InvoiceLanguage,
          ...clientCountry(item, formText(f, "country")),
          ...details,
        }).catch((error: unknown) => {
          // Ohne das Datenbank-Update kennt die Tabelle die neuen Spalten nicht.
          const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
          if (code === "database" && Object.keys(details).length) setMissingColumns(true);
          throw error;
        }),
      onClose,
    );
  }
  return (
    <Dialog title={t(item ? "edit" : "newClient")} onClose={onClose} busy={busy} wide>
      <form className="form-stack" onSubmit={submit}>
        <fieldset className="finance-fieldset">
          <legend>{t("sectionClient")}</legend>
          <Field label={t("name")}>
            <input name="name" defaultValue={item?.name} maxLength={160} required autoComplete="organization" />
          </Field>
          <div className="form-grid">
            <Field label={t("customerNumber")}>
              <input name="customer_number" defaultValue={item?.customer_number} maxLength={40} autoComplete="off" aria-invalid={numberTaken || undefined} aria-describedby={numberTaken ? "client-number-taken" : undefined} onChange={() => setNumberTaken(false)} />
            </Field>
            <Field label={t("industry")}>
              <input name="industry" defaultValue={item?.industry} maxLength={80} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="finance-fieldset">
          <legend>{t("sectionContact")}</legend>
          <div className="form-grid finance-grid-3">
            <Field label={t("invoiceEmail")}>
              <input type="email" name="contact_email" defaultValue={item?.contact_email} maxLength={254} autoComplete="email" />
            </Field>
            <Field label={t("phone")}>
              <input type="tel" name="phone" defaultValue={item?.phone} maxLength={60} autoComplete="tel" />
            </Field>
            <Field label={t("website")}>
              <input name="website" defaultValue={item?.website} maxLength={300} autoComplete="url" placeholder="kunde.de" />
            </Field>
          </div>
        </fieldset>
        <fieldset className="finance-fieldset">
          <legend>{t("contacts")}</legend>
          {contacts.length === 0 && <p className="muted tiny">{t("noContacts")}</p>}
          <ol className="finance-contact-rows">
            {contacts.map((row, index) => (
              <li key={row.key} className="finance-contact-row">
                <div className="finance-contact-label">
                  {index === 0 ? <span className="badge badge-submitted">{t("primaryContact")}</span> : (
                    <button type="button" className="text-button tiny" onClick={() => setContacts((list) => [row, ...list.filter((r) => r.key !== row.key)])}>{t("makePrimary")}</button>
                  )}
                  <button type="button" className="icon-button" aria-label={`${t("removeContact")}: ${row.name || index + 1}`} onClick={() => setContacts((list) => list.filter((r) => r.key !== row.key))}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="form-grid finance-grid-4">
                  <Field label={t("contactName")}>
                    <input value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} maxLength={160} required={Boolean(row.role || row.email || row.phone)} autoComplete="off" />
                  </Field>
                  <Field label={t("contactRole")}>
                    <input value={row.role} onChange={(e) => update(row.key, { role: e.target.value })} maxLength={120} autoComplete="off" />
                  </Field>
                  <Field label={t("contactEmail")}>
                    <input type="email" value={row.email} onChange={(e) => update(row.key, { email: e.target.value })} maxLength={254} autoComplete="off" />
                  </Field>
                  <Field label={t("phone")}>
                    <input type="tel" value={row.phone} onChange={(e) => update(row.key, { phone: e.target.value })} maxLength={60} autoComplete="off" />
                  </Field>
                </div>
              </li>
            ))}
          </ol>
          {contacts.length < 20 && (
            <button type="button" className="button secondary small align-start" onClick={() => setContacts((list) => [...list, contactRow()])}>
              <Plus size={15} />
              {t("addContact")}
            </button>
          )}
        </fieldset>
        <fieldset className="finance-fieldset">
          <legend>{t("sectionBilling")}</legend>
          <Field label={t("address")}>
            <textarea name="billing_address" defaultValue={item?.billing_address} rows={3} maxLength={2000} autoComplete="street-address" />
          </Field>
          <div className="form-grid">
            <Field label={t("taxId")}>
              <input name="tax_id" defaultValue={item?.tax_id} maxLength={100} />
            </Field>
            <Field label={t("countryLabel")}>
              <input name="country" defaultValue={item?.country ?? "DE"} maxLength={2} pattern="[A-Za-z]{2}" autoComplete="country" />
            </Field>
          </div>
          <LanguageSelect value={item?.language || locale} />
        </fieldset>
        <fieldset className="finance-fieldset">
          <legend>{t("clientNotes")}</legend>
          <Field label={t("clientNotes")}>
            <textarea name="notes" defaultValue={item?.notes} rows={4} maxLength={4000} aria-describedby="client-notes-hint" />
          </Field>
          <small id="client-notes-hint" className="muted">{t("clientNotesHint")}</small>
        </fieldset>
        {numberTaken && <Notice><span id="client-number-taken">{t("customerNumberTaken")}</span></Notice>}
        {missingColumns && <Notice kind="info">{t("clientMigration")}</Notice>}
        <Actions onClose={onClose} />
      </form>
    </Dialog>
  );
}
const LOGO_LIMIT = 300000,
  LOGO_EDGE = 480;
/** Rastert jedes Bild (auch SVG) über Canvas auf höchstens 480 px Kante — klein genug für den Snapshot, scharf genug für den Druck. */
async function readLogo(file: File): Promise<string> {
  const fail = () => Object.assign(new Error("logo"), { code: "logo_invalid" });
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw fail();
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.addEventListener("load", () => resolve(img));
      img.addEventListener("error", () => reject(fail()));
      img.src = url;
    });
    const width = image.naturalWidth || LOGO_EDGE,
      height = image.naturalHeight || LOGO_EDGE,
      scale = Math.min(1, LOGO_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw fail();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // JPEG bleibt JPEG (Fotos blähen als PNG auf); alles andere behält als PNG seine Transparenz.
    const data =
      file.type === "image/jpeg"
        ? canvas.toDataURL("image/jpeg", 0.9)
        : canvas.toDataURL("image/png");
    if (!data.startsWith("data:image/") || data.length > LOGO_LIMIT)
      throw fail();
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function Company() {
  const { data, workspace, role, t, service, run, busy, isDemo } = useFinance(),
    profile = data.profile,
    // undefined = Logo nie angefasst und keins geladen: der Schlüssel bleibt dann
    // aus dem Upsert heraus, damit eine Live-DB ohne logo_data-Spalte weiter speichert.
    [logo, setLogo] = useState<string | undefined>(profile?.logo_data);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (role !== "owner") return;
    const f = new FormData(e.currentTarget);
    // Wie beim Logo: der Schlüssel reist nur mit, wenn das Profil ihn kennt oder
    // der Wert vom Standard abweicht — so speichert auch eine Live-DB vor der Migration.
    const terms = Number(formText(f, "payment_terms_days") || "14");
    void run(() =>
      service.saveProfile({
        workspace_id: workspace.id,
        legal_name: formText(f, "legal_name"),
        billing_address: formText(f, "billing_address"),
        tax_id: formText(f, "tax_id"),
        payment_details: formText(f, "payment_details"),
        invoice_prefix: formText(f, "invoice_prefix"),
        footer: formText(f, "footer"),
        ...(logo === undefined ? {} : { logo_data: logo }),
        ...(profile?.payment_terms_days === undefined && terms === 14
          ? {}
          : { payment_terms_days: terms }),
        ...(profileCountry(profile, formText(f, "country"))),
      }),
    );
  }
  function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void run(async () => setLogo(await readLogo(file)));
  }
  return (
    <div className="finance-company">
      <Section title="company">
        <p className="muted">{t(isDemo ? "demoProfileHint" : "profileHint")}</p>
        {role !== "owner" && <Notice kind="info">{t("ownerOnly")}</Notice>}
        <form className="form-stack" onSubmit={submit}>
          <fieldset
            disabled={role !== "owner" || busy}
            className="finance-fieldset"
          >
            <Field label={t("legalName")}>
              <input
                name="legal_name"
                required
                defaultValue={profile?.legal_name || ""}
                maxLength={160}
              />
            </Field>
            <Field label={t("address")}>
              <textarea
                name="billing_address"
                required
                defaultValue={profile?.billing_address || ""}
                rows={3}
                maxLength={2000}
              />
            </Field>
            <div className="form-grid">
              <Field label={t("taxId")}>
                <input
                  name="tax_id"
                  required
                  defaultValue={profile?.tax_id || ""}
                  maxLength={100}
                />
              </Field>
              <Field label={t("prefix")}>
                <input
                  name="invoice_prefix"
                  required
                  defaultValue={profile?.invoice_prefix || "INV"}
                  maxLength={16}
                  pattern="[A-Z0-9][A-Z0-9-]{0,15}"
                />
              </Field>
              <Field label={t("countryLabel")}>
                <input
                  name="country"
                  defaultValue={profile?.country ?? "DE"}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  autoComplete="country"
                />
              </Field>
              <Field label={t("paymentTerms")} hint={t("paymentTermsHint")}>
                <input
                  name="payment_terms_days"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  required
                  defaultValue={profile?.payment_terms_days ?? 14}
                />
              </Field>
            </div>
            <Field label={t("payment")}>
              <textarea
                name="payment_details"
                defaultValue={profile?.payment_details || ""}
                rows={3}
                maxLength={2000}
              />
            </Field>
            <Field label={t("footer")}>
              <textarea
                name="footer"
                defaultValue={profile?.footer || ""}
                rows={3}
                maxLength={4000}
              />
            </Field>
            <div className="field finance-logo-field">
              <span>{t("logo")}</span>
              {logo ? (
                <img className="finance-logo-preview" src={logo} alt={t("logo")} />
              ) : (
                <p className="muted">{t("logoHint")}</p>
              )}
              <div className="button-row">
                <label className="button secondary small">
                  {t("logoUpload")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={pickLogo}
                  />
                </label>
                {!!logo && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => setLogo("")}
                  >
                    {t("logoRemove")}
                  </button>
                )}
              </div>
            </div>
          </fieldset>
          {role === "owner" && (
            <button className="button primary align-right" disabled={busy}>
              {t("save")}
            </button>
          )}
        </form>
      </Section>
      <Section title="integrations">
        <p className="muted">{t("integrationsNote")}</p>
        <div className="finance-export-chips">
          <span>CSV</span>
          <span>PDF</span>
          <span>MCP</span>
        </div>
        <p className="finance-caption">{t("pdfNote")}</p>
        <p className="finance-caption">{t("noSend")}</p>
      </Section>
    </div>
  );
}
