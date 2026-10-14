import { createContext, useContext, useState, type ReactNode } from "react";
import type { FinanceService } from "../../shared/finance-service";
import type {
  BillingProfile,
  Expense,
  FinanceClient,
  FinanceOverview,
  Invoice,
  InvoiceLanguage,
  ProjectPlan,
  StaffRate,
} from "../../shared/finance-types";
import type { Membership, Project, Role, Workspace } from "../../shared/types";
import { Field, Notice } from "../components";
import { ft, type FinanceKey } from "./catalog";
import { currencyDigits, decimalToMinor, minorInput } from "./documents";
export interface FinanceData {
  clients: FinanceClient[];
  profile: BillingProfile | null;
  rates: StaffRate[];
  plans: ProjectPlan[];
  expenses: Expense[];
  invoices: Invoice[];
  overview: FinanceOverview;
}
export type FinanceTab = "overview" | "clients" | "planning" | "invoices" | "company";
export interface FinanceNavigation {
  projectId: string;
  tab: FinanceTab;
  revision: number;
}
export interface FinanceNavigationTarget {
  view: "projects" | "tasks" | "time" | "reports" | "finance";
  projectId: string;
  financeTab?: FinanceTab;
}
export interface FinanceContextValue {
  service: FinanceService;
  workspace: Workspace;
  members: Membership[];
  projects: Project[];
  role: Role;
  locale: InvoiceLanguage;
  data: FinanceData;
  busy: boolean;
  isDemo: boolean;
  errorMessage: string | null;
  range: { from: string; to: string };
  projectId?: string;
  setProjectId?: (projectId: string) => void;
  navigate?: (target: FinanceNavigationTarget) => void;
  t: (key: FinanceKey) => string;
  run: (
    action: () => Promise<unknown>,
    onSuccess?: () => void,
  ) => Promise<boolean>;
}
export const FinanceContext = createContext<FinanceContextValue | null>(null);
export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("Finance context required");
  return context;
}
/** An unavailable explicit scope stays unavailable until the user resets it. */
export function useFinanceProject() {
  const { projectId, setProjectId, projects, workspace } = useFinance();
  const [localProjectId, setLocalProjectId] = useState("");
  const selected = projectId ?? localProjectId;
  const project = projects.find((project) => project.id === selected && project.workspace_id === workspace.id);
  return {
    projectId: selected,
    setProjectId: setProjectId ?? setLocalProjectId,
    project,
    available: !selected || !!project,
  };
}
export function ProjectLink({ projectId }: { projectId: string }) {
  const { projects, navigate, workspace } = useFinance();
  const project = projects.find((item) => item.id === projectId && item.workspace_id === workspace.id);
  if (!project || !navigate) return <>{project?.name || projectId}</>;
  return (
    <button type="button" className="text-button finance-project-link" aria-label={project.name}
      onClick={() => navigate({ view: "projects", projectId })}>
      {project.name}
    </button>
  );
}
export function FinanceProjectFilter({ projectId, onChange }: {
  projectId: string;
  onChange: (projectId: string) => void;
}) {
  const { projects: allProjects, workspace, navigate, t } = useFinance();
  const projects = allProjects.filter((item) => item.workspace_id === workspace.id);
  const project = projects.find((item) => item.id === projectId);
  return (
    <div className="finance-project-filter">
      <Field label={t("project")}>
        <select value={projectId} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t("allProjects")}</option>
          {!!projectId && !project && <option value={projectId}>{t("projectUnavailable")}</option>}
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      {!!projectId && <button type="button" className="text-button" onClick={() => onChange("")}>{t("allProjects")}</button>}
      {project && navigate && <details className="finance-project-work">
        <summary>{t("projectWork")}</summary>
        <div className="button-row">
          <ProjectLink projectId={project.id} />
          <button type="button" className="text-button" onClick={() => navigate({ view: "tasks", projectId })}>{t("tasks")}</button>
          <button type="button" className="text-button" onClick={() => navigate({ view: "time", projectId })}>{t("time")}</button>
        </div>
      </details>}
    </div>
  );
}
export function Actions({
  onClose,
  label = "save",
}: {
  onClose: () => void;
  label?: FinanceKey;
}) {
  const { busy, t, errorMessage } = useFinance();
  return (
    <>
      {errorMessage && <Notice>{errorMessage}</Notice>}
      <div className="form-actions">
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          {t("cancel")}
        </button>
        <button className="button primary" disabled={busy} type="submit">
          {t(label)}
        </button>
      </div>
    </>
  );
}
export function MoneyField({
  label,
  name,
  value,
  required = false,
  onChange,
}: {
  label: FinanceKey;
  name?: string;
  value?: number | null;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const { t, workspace } = useFinance();
  return (
    <Field label={`${t(label)} (${workspace.currency})`}>
      <input
        name={name}
        type="number"
        step={10 ** -currencyDigits(workspace.currency)}
        min="0"
        max="1000000000"
        required={required}
        defaultValue={minorInput(value, workspace.currency)}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </Field>
  );
}
export function ProjectSelect({
  name = "project_id",
  value,
  optional = false,
  onChange,
}: {
  name?: string;
  value?: string | null;
  optional?: boolean;
  onChange?: (value: string) => void;
}) {
  const { t, projects } = useFinance();
  return (
    <Field label={t("project")}>
      <select
        name={name}
        defaultValue={onChange ? undefined : value || ""}
        value={onChange ? value || "" : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={!optional}
      >
        <option value="" disabled={!optional}>
          {t(optional ? "none" : "select")}
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function ClientSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { t, data } = useFinance();
  return (
    <Field label={t("clients")}>
      <select
        name="client_id"
        defaultValue={onChange ? undefined : value || ""}
        value={onChange ? value || "" : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required
      >
        <option value="" disabled>
          {t("select")}
        </option>
        {data.clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function LanguageSelect({
  value,
  onChange,
}: {
  value: InvoiceLanguage;
  onChange?: (value: InvoiceLanguage) => void;
}) {
  const { t } = useFinance();
  return (
    <Field label={t("language")}>
      <select
        name="language"
        defaultValue={onChange ? undefined : value}
        value={onChange ? value : undefined}
        onChange={
          onChange
            ? (e) => onChange(e.target.value as InvoiceLanguage)
            : undefined
        }
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="zh">简体中文</option>
      </select>
    </Field>
  );
}
export function Section({
  title,
  action,
  children,
}: {
  title: FinanceKey;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useFinance();
  return (
    <section className="panel finance-panel">
      <div className="finance-panel-heading">
        <h2>{t(title)}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export const formText = (f: FormData, key: string) =>
  String(f.get(key) || "").trim();
export function formMoney(
  f: FormData,
  key: string,
  currency: string,
  nullable = false,
) {
  const text = formText(f, key);
  if (!text && nullable) return null;
  try {
    return decimalToMinor(text || "0", currency);
  } catch {
    throw { code: "validation" };
  }
}
export const financeText = ft;
