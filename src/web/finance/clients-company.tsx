import { useRef, useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import type {
  FinanceClient,
  InvoiceLanguage,
} from "../../shared/finance-types";
import { Dialog, Empty, Field, Notice } from "../components";
import {
  Actions,
  LanguageSelect,
  Section,
  formText,
  useFinance,
} from "./context";
export function Clients() {
  const { data, t } = useFinance(),
    [editor, setEditor] = useState<FinanceClient | "new" | null>(null);
  return (
    <Section
      title="clients"
      action={
        <button
          className="button primary small"
          onClick={() => setEditor("new")}
        >
          <Plus size={16} />
          {t("newClient")}
        </button>
      }
    >
      {data.clients.length === 0 ? (
        <Empty title={t("noClients")} text={t("clientsHint")} />
      ) : (
        <div className="finance-client-grid">
          {data.clients.map((c) => (
            <article className="finance-client" key={c.id}>
              <div>
                <h3>{c.name}</h3>
                <button
                  className="icon-button"
                  aria-label={`${t("edit")}: ${c.name}`}
                  onClick={() => setEditor(c)}
                >
                  <Pencil size={16} />
                </button>
              </div>
              <p className="finance-prewrap muted">
                {c.billing_address || "–"}
              </p>
              <small>{c.contact_email}</small>
              <div className="finance-client-meta">
                <span>
                  {c.language === "en"
                    ? "English"
                    : c.language === "de"
                      ? "Deutsch"
                      : "简体中文"}
                </span>
                <span>{c.tax_id}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      {editor && (
        <ClientEditor
          item={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </Section>
  );
}
function ClientEditor({
  item,
  onClose,
}: {
  item?: FinanceClient;
  onClose: () => void;
}) {
  const { t, workspace, locale, service, run, busy } = useFinance(),
    id = useRef(item?.id || crypto.randomUUID());
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
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
        }),
      onClose,
    );
  }
  return (
    <Dialog
      title={t(item ? "edit" : "newClient")}
      onClose={onClose}
      busy={busy}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field label={t("name")}>
          <input
            name="name"
            defaultValue={item?.name}
            maxLength={160}
            required
            autoComplete="organization"
          />
        </Field>
        <Field label={t("address")}>
          <textarea
            name="billing_address"
            defaultValue={item?.billing_address}
            rows={3}
            maxLength={2000}
            autoComplete="street-address"
          />
        </Field>
        <div className="form-grid">
          <Field label={t("email")}>
            <input
              type="email"
              name="contact_email"
              defaultValue={item?.contact_email}
              maxLength={254}
            />
          </Field>
          <Field label={t("taxId")}>
            <input name="tax_id" defaultValue={item?.tax_id} maxLength={100} />
          </Field>
        </div>
        <LanguageSelect value={item?.language || locale} />
        <Actions onClose={onClose} />
      </form>
    </Dialog>
  );
}
export function Company() {
  const { data, workspace, role, t, service, run, busy, isDemo } = useFinance(),
    profile = data.profile;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (role !== "owner") return;
    const f = new FormData(e.currentTarget);
    void run(() =>
      service.saveProfile({
        workspace_id: workspace.id,
        legal_name: formText(f, "legal_name"),
        billing_address: formText(f, "billing_address"),
        tax_id: formText(f, "tax_id"),
        payment_details: formText(f, "payment_details"),
        invoice_prefix: formText(f, "invoice_prefix"),
        footer: formText(f, "footer"),
      }),
    );
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
