import { useRef, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type {
  BillingMode,
  EstimateLine,
  Expense,
  StaffRate,
  WorkerKind,
} from "../../shared/finance-types";
import { salaryHourlyCost } from "../../shared/finance-math";
import { Dialog, Field } from "../components";
import { useI18n } from "../i18n";
import { SelectMenu, memberOption, memberTabs } from "../select-menu";
import {
  Actions,
  FinanceProjectFilter,
  MoneyField,
  ProjectSelect,
  Section,
  formMoney,
  formText,
  useFinance,
  useFinanceProject,
} from "./context";
import {
  currencyDigits,
  decimalToMinor,
  displayDate,
  minorInput,
  money,
} from "./documents";
export function Planning() {
  const { projects, t } = useFinance(),
    { projectId: project, setProjectId: setProject, available } = useFinanceProject();
  return (
    <div className="finance-stack">
      <Section title="plan">
        <FinanceProjectFilter projectId={project} onChange={setProject} />
        {project && available ? (
          <PlanEditor key={project} projectId={project} />
        ) : (
          <p className="muted">{t(!available ? "projectUnavailable" : projects.length ? "chooseProject" : "noProjects")}</p>
        )}
      </Section>
      {available && <Rates />}
      {project && available && <Expenses key={project} projectId={project} />}
    </div>
  );
}
type EstimateEdit = {
  key: string;
  label: string;
  kind: WorkerKind;
  user_id: string;
  hours: string;
  cost: string;
  bill: string;
};
function PlanEditor({ projectId }: { projectId: string }) {
  const { data, workspace, members, t, service, run, busy } = useFinance(),
    plan = data.plans.find((p) => p.project_id === projectId);
  const { t: shared } = useI18n();
  const [billing, setBilling] = useState<BillingMode>(
      plan?.billing_mode || "hourly",
    ),
    [lines, setLines] = useState<EstimateEdit[]>(
      () =>
        plan?.lines.map((line) => ({
          key: crypto.randomUUID(),
          label: line.label,
          kind: line.kind,
          user_id: line.user_id || "",
          hours: String(line.planned_minutes / 60),
          cost: minorInput(line.cost_rate_minor, workspace.currency),
          bill: minorInput(line.bill_rate_minor, workspace.currency),
        })) || [],
    );
  function update(key: string, patch: Partial<EstimateEdit>) {
    setLines((old) =>
      old.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const estimates: EstimateLine[] = lines.map((line) => ({
        label: line.label,
        kind: line.kind,
        user_id: line.user_id || null,
        planned_minutes: Math.round(Number(line.hours) * 60),
        cost_rate_minor: line.cost
          ? decimalToMinor(line.cost, workspace.currency)
          : null,
        bill_rate_minor: line.bill
          ? decimalToMinor(line.bill, workspace.currency)
          : null,
      }));
      return service.saveProjectPlan({
        workspace_id: workspace.id,
        project_id: projectId,
        client_id: formText(f, "client_id") || null,
        billing_mode: billing,
        default_bill_rate_minor: formMoney(
          f,
          "default_bill_rate_minor",
          workspace.currency,
          true,
        ),
        fixed_fee_minor: formMoney(f, "fixed_fee_minor", workspace.currency)!,
        planned_expenses_minor: formMoney(
          f,
          "planned_expenses_minor",
          workspace.currency,
        )!,
        lines: estimates,
      });
    });
  }
  return (
    <form className="form-stack finance-plan-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label={t("clients")}>
          <SelectMenu label={t("clients")} name="client_id" defaultValue={plan?.client_id || ""}
            options={[{ value: "", label: t("none") }, ...data.clients.map((c) => ({ value: c.id, label: c.name, sublabel: c.contact_email || undefined, keywords: c.contact_email }))]}/>
        </Field>
        <Field label={t("billingMode")}>
          <SelectMenu label={t("billingMode")} searchable={false} value={billing}
            onChange={(mode) => setBilling(mode as BillingMode)}
            options={(["hourly", "fixed", "internal"] as const).map((mode) => ({ value: mode, label: t(mode) }))}/>
        </Field>
        <MoneyField
          name="default_bill_rate_minor"
          label="billRate"
          value={plan?.default_bill_rate_minor}
        />
        <MoneyField
          name="fixed_fee_minor"
          label="fixedFee"
          value={plan?.fixed_fee_minor || 0}
        />
        <MoneyField
          name="planned_expenses_minor"
          label="expenseBudget"
          value={plan?.planned_expenses_minor || 0}
        />
      </div>
      <div className="finance-panel-heading">
        <h3>{t("estimate")}</h3>
        <button
          className="button secondary small"
          type="button"
          onClick={() =>
            setLines((old) => [
              ...old,
              {
                key: crypto.randomUUID(),
                label: "",
                kind: "employee",
                user_id: "",
                hours: "0",
                cost: "",
                bill: "",
              },
            ])
          }
        >
          <Plus size={15} />
          {t("addLine")}
        </button>
      </div>
      <p className="finance-caption">{t("rateHint")}</p>
      {lines.map((line, index) => (
        <fieldset className="finance-line" key={line.key}>
          <legend>
            {t("estimate")} {index + 1}
          </legend>
          <div className="finance-line-heading">
            <Field label={t("phase")}>
              <input
                value={line.label}
                onChange={(e) => update(line.key, { label: e.target.value })}
                required
                maxLength={240}
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
              <Trash2 size={16} />
            </button>
          </div>
          <div className="finance-line-grid">
            <Field label={t("kind")}>
              <SelectMenu label={t("kind")} searchable={false} value={line.kind}
                onChange={(kind) => update(line.key, { kind: kind as WorkerKind })}
                options={[{ value: "employee", label: t("employee") }, { value: "freelancer", label: t("freelancer") }]}/>
            </Field>
            <Field label={t("person")}>
              <SelectMenu label={t("person")} value={line.user_id}
                onChange={(user_id) => update(line.key, { user_id })}
                tabs={memberTabs(members, shared)}
                options={[{ value: "", label: t("noAccount") }, ...members.map((m) => memberOption(m))]}/>
            </Field>
            <Field label={t("hours")}>
              <input
                type="number"
                min="0"
                max="100000"
                step="0.01"
                required
                value={line.hours}
                onChange={(e) => update(line.key, { hours: e.target.value })}
              />
            </Field>
            <Field label={`${t("costRate")} (${workspace.currency})`}>
              <input
                type="number"
                min="0"
                step={10 ** -currencyDigits(workspace.currency)}
                value={line.cost}
                onChange={(e) => update(line.key, { cost: e.target.value })}
              />
            </Field>
            <Field label={`${t("billRate")} (${workspace.currency})`}>
              <input
                type="number"
                min="0"
                step={10 ** -currencyDigits(workspace.currency)}
                value={line.bill}
                onChange={(e) => update(line.key, { bill: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>
      ))}
      <button className="button primary align-right" disabled={busy}>
        {t("save")}
      </button>
    </form>
  );
}
function Rates() {
  const { data, members, t, locale, workspace } = useFinance(),
    [editor, setEditor] = useState<StaffRate | "new" | null>(null);
  return (
    <Section
      title="rates"
      action={
        <button
          className="button secondary small"
          disabled={!members.length}
          onClick={() => setEditor("new")}
        >
          <Plus size={16} />
          {t("newRate")}
        </button>
      }
    >
      <p className="finance-caption">{t("rateHint")}</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("person")}</th>
              <th>{t("kind")}</th>
              <th>{t("effective")}</th>
              <th>{t("costRate")}</th>
              <th>{t("billRate")}</th>
              <th>
                <span className="sr-only">{t("edit")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rates.map((rate) => (
              <tr key={rate.id}>
                <td>
                  {members.find((m) => m.user_id === rate.user_id)
                    ?.display_name ||
                    members.find((m) => m.user_id === rate.user_id)?.email ||
                    rate.user_id}
                </td>
                <td>{t(rate.kind)}</td>
                <td>{displayDate(rate.effective_from, locale)}</td>
                <td>
                  {money(rate.cost_rate_minor, workspace.currency, locale)}
                </td>
                <td>
                  {money(rate.bill_rate_minor, workspace.currency, locale)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={t("edit")}
                    onClick={() => setEditor(rate)}
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editor && (
        <RateEditor
          item={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </Section>
  );
}
function RateEditor({
  item,
  onClose,
}: {
  item?: StaffRate;
  onClose: () => void;
}) {
  const { t, workspace, members, range, service, run, busy, locale } =
      useFinance(),
    id = useRef(item?.id || crypto.randomUUID());
  const { t: shared } = useI18n();
  const [cost, setCost] = useState(
      minorInput(item?.cost_rate_minor, workspace.currency),
    ),
    [annual, setAnnual] = useState(""),
    [hours, setHours] = useState("");
  let estimate: number | null = null;
  try {
    if (annual && Number(hours) > 0)
      estimate = salaryHourlyCost(
        decimalToMinor(annual, workspace.currency),
        Number(hours),
      );
  } catch {
    /* Incomplete helper input. */
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        service.saveRate({
          id: id.current,
          workspace_id: workspace.id,
          user_id: formText(f, "user_id"),
          kind: formText(f, "kind") as WorkerKind,
          effective_from: formText(f, "effective_from"),
          cost_rate_minor: formMoney(
            f,
            "cost_rate_minor",
            workspace.currency,
            true,
          ),
          bill_rate_minor: formMoney(
            f,
            "bill_rate_minor",
            workspace.currency,
            true,
          ),
        }),
      onClose,
    );
  }
  return (
    <Dialog title={t("rates")} onClose={onClose} busy={busy}>
      <form className="form-stack" onSubmit={submit}>
        <Field label={t("person")}>
          <SelectMenu label={t("person")} name="user_id" required placeholder={t("select")} defaultValue={item?.user_id || ""}
            tabs={memberTabs(members, shared)}
            options={members.map((m) => memberOption(m))}/>
        </Field>
        <div className="form-grid">
          <Field label={t("kind")}>
            <SelectMenu label={t("kind")} searchable={false} name="kind" defaultValue={item?.kind || "employee"}
              options={[{ value: "employee", label: t("employee") }, { value: "freelancer", label: t("freelancer") }]}/>
          </Field>
          <Field label={t("effective")}>
            <input
              type="date"
              name="effective_from"
              required
              defaultValue={item?.effective_from || range.to}
            />
          </Field>
          <Field label={`${t("costRate")} (${workspace.currency})`}>
            <input
              name="cost_rate_minor"
              type="number"
              min="0"
              step={10 ** -currencyDigits(workspace.currency)}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
          <MoneyField
            label="billRate"
            name="bill_rate_minor"
            value={item?.bill_rate_minor}
          />
        </div>
        <details className="finance-helper">
          <summary>{t("salaryHelper")}</summary>
          <p className="finance-caption">{t("salaryNote")}</p>
          <div className="form-grid">
            <Field label={`${t("annualCost")} (${workspace.currency})`}>
              <input
                type="number"
                min="0"
                step={10 ** -currencyDigits(workspace.currency)}
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
            </Field>
            <Field label={t("productiveHours")}>
              <input
                type="number"
                min="1"
                max="8784"
                step="1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
          </div>
          <div className="finance-toolbar">
            <strong>
              {estimate === null
                ? "–"
                : money(estimate, workspace.currency, locale)}
            </strong>
            <button
              type="button"
              className="button secondary small"
              disabled={estimate === null}
              onClick={() => setCost(minorInput(estimate, workspace.currency))}
            >
              {t("useCost")}
            </button>
          </div>
        </details>
        <Actions onClose={onClose} />
      </form>
    </Dialog>
  );
}
function Expenses({ projectId }: { projectId: string }) {
  const { data, t, locale, workspace, service, run, busy } = useFinance(),
    [editor, setEditor] = useState<Expense | "new" | null>(null),
    [deleting, setDeleting] = useState<Expense | null>(null);
  return (
    <Section
      title="expenses"
      action={
        <button
          className="button secondary small"
          onClick={() => setEditor("new")}
        >
          <Plus size={16} />
          {t("newExpense")}
        </button>
      }
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("date")}</th>
              <th>{t("description")}</th>
              <th>{t("category")}</th>
              <th>{t("amount")}</th>
              <th>
                <span className="sr-only">{t("edit")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.expenses
              .filter((x) => x.project_id === projectId)
              .map((expense) => (
                <tr key={expense.id}>
                  <td>{displayDate(expense.expense_date, locale)}</td>
                  <td>{expense.description}</td>
                  <td>{t(expense.category)}</td>
                  <td>
                    {money(expense.amount_minor, workspace.currency, locale)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={t("edit")}
                        onClick={() => setEditor(expense)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("remove")}
                        onClick={() => setDeleting(expense)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editor && (
        <ExpenseEditor
          projectId={projectId}
          item={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Dialog
          title={t("remove")}
          busy={busy}
          onClose={() => setDeleting(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => service.deleteExpense(workspace.id, deleting.id),
                () => setDeleting(null),
              );
            }}
          >
            <p>{t("deleteExpense")}</p>
            <p>{deleting.description}</p>
            <Actions label="remove" onClose={() => setDeleting(null)} />
          </form>
        </Dialog>
      )}
    </Section>
  );
}
function ExpenseEditor({
  projectId,
  item,
  onClose,
}: {
  projectId: string;
  item?: Expense;
  onClose: () => void;
}) {
  const { t, workspace, service, run, busy, range } = useFinance(),
    id = useRef(item?.id || crypto.randomUUID());
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        service.saveExpense({
          id: id.current,
          workspace_id: workspace.id,
          project_id: formText(f, "project_id"),
          expense_date: formText(f, "expense_date"),
          description: formText(f, "description"),
          amount_minor: formMoney(f, "amount_minor", workspace.currency)!,
          category: formText(f, "category") as "external" | "other",
          not_time_costed: f.get("not_time_costed") === "on",
        }),
      onClose,
    );
  }
  return (
    <Dialog title={t("expenses")} onClose={onClose} busy={busy}>
      <form className="form-stack" onSubmit={submit}>
        <ProjectSelect value={item?.project_id || projectId} />
        <div className="form-grid">
          <Field label={t("date")}>
            <input
              name="expense_date"
              type="date"
              required
              defaultValue={item?.expense_date || range.to}
            />
          </Field>
          <Field label={t("category")}>
            <SelectMenu label={t("category")} searchable={false} name="category" defaultValue={item?.category || "external"}
              options={[{ value: "external", label: t("external") }, { value: "other", label: t("other") }]}/>
          </Field>
        </div>
        <Field label={t("description")}>
          <textarea
            name="description"
            defaultValue={item?.description}
            required
            maxLength={1000}
            rows={3}
          />
        </Field>
        <MoneyField
          label="amount"
          name="amount_minor"
          value={item?.amount_minor}
          required
        />
        <label className="checkbox-field">
          <input
            name="not_time_costed"
            type="checkbox"
            required
            defaultChecked={item?.not_time_costed || false}
          />
          {t("expenseConfirm")}
        </label>
        <Actions onClose={onClose} />
      </form>
    </Dialog>
  );
}
