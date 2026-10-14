import { ArrowDownToLine } from "lucide-react";
import { Notice } from "../components";
import { FinanceProjectFilter, ProjectLink, Section, useFinance, useFinanceProject } from "./context";
import { downloadText, money, overviewCsv, localeCode } from "./documents";
import type { FinanceKey } from "./catalog";
import { summarizeInvoices } from "./invoice-summary";
export function Overview() {
  const { data, locale, workspace, projects, range, t, navigate } = useFinance(),
    { projectId: project, setProjectId: setProject, available } = useFinanceProject();
  const rows = data.overview.projects.filter(
      (p) => available && (!project || p.project_id === project),
    ),
    m = (value: number | null) => money(value, workspace.currency, locale);
  const invoiceTotals = summarizeInvoices(available ? data.invoices : [], range, project);
  const date = (value: string) =>
    new Intl.DateTimeFormat(localeCode(locale), {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  const total = (
    field:
      | "planned_revenue_minor"
      | "actual_cost_minor"
      | "forecast_margin_minor",
  ) =>
    rows.some((row) => row[field] === null)
      ? null
      : rows.reduce((sum, row) => sum + (row[field] || 0), 0);
  const hour = (minutes: number) =>
    new Intl.NumberFormat(localeCode(locale), {
      maximumFractionDigits: 1,
    }).format(minutes / 60);
  return (
    <>
      <div className="finance-toolbar">
        <FinanceProjectFilter projectId={project} onChange={setProject} />
        <button
          className="button secondary"
          onClick={() =>
            downloadText(
              `finance-${data.overview.from}-${data.overview.to}.csv`,
              overviewCsv(
                { ...data.overview, projects: rows },
                new Map(projects.map((p) => [p.id, p.name])),
                locale,
              ),
            )
          }
        >
          <ArrowDownToLine size={16} />
          {t("csv")}
        </button>
      </div>
      <div className="finance-metrics">
        {(
          [
            ["projectPlanVolume", total("planned_revenue_minor")],
            ["actualCost", total("actual_cost_minor")],
            ["forecastMargin", total("forecast_margin_minor")],
          ] as [FinanceKey, number | null][]
        ).map(([label, value]) => (
          <div key={label} className="finance-metric">
            <span>{t(label)}</span>
            <strong>{m(value)}</strong>
            <small>
              {workspace.currency} · {t(label === "actualCost" ? "selectedPeriod" : "fullProject")}
            </small>
          </div>
        ))}
      </div>
      <p className="finance-caption">{t("marginNote")}</p>
      <section className="finance-invoice-summary" aria-label={t("invoiceActivity")}>
        <div className="finance-summary-heading">
          <h2>{t("invoiceActivity")}</h2>
          <p>
            <time dateTime={range.from}>{date(range.from)}</time>
            {" – "}
            <time dateTime={range.to}>{date(range.to)}</time>
          </p>
        </div>
        <div className="finance-metrics finance-metrics-invoices">
          {(["invoicedNet", "paidNet", "openNet"] as const).map((label) => (
            <div key={label} className="finance-metric">
              <span>{t(label)}</span>
              <strong>{m(invoiceTotals[label])}</strong>
              <small>
                {workspace.currency} · {t(label === "invoicedNet" ? "selectedPeriod" : "currentStatus")}
              </small>
            </div>
          ))}
        </div>
        <p className="finance-caption">{t("invoiceSummaryNote")}</p>
      </section>
      {rows.length === 0 ? (
        <div className="panel muted">{t(available ? "noProjects" : "projectUnavailable")}</div>
      ) : (
        <div className="finance-projects">
          {rows.map((row) => {
            const info = projects.find((p) => p.id === row.project_id);
            return (
              <Section
                key={row.project_id}
                title="plan"
                action={<span className="badge">{t(row.billing_mode)}</span>}
              >
                <h3 className="finance-project-name">
                  <ProjectLink projectId={row.project_id} />
                </h3>
                <small className="muted">{info?.code}</small>
                {(row.missing_cost_entries > 0 ||
                  row.missing_estimate_costs > 0) && (
                  <Notice kind="info">
                    {t("missingRates")} (
                    {row.missing_cost_entries + row.missing_estimate_costs})
                  </Notice>
                )}
                {row.missing_bill_entries > 0 && (
                  <Notice kind="info">
                    {t("missingBills")} ({row.missing_bill_entries})
                  </Notice>
                )}
                <dl className="finance-details">
                  {(
                    [
                      ["plannedRevenue", row.planned_revenue_minor],
                      ["plannedCost", row.planned_cost_minor],
                      ["plannedMargin", row.planned_margin_minor],
                      ["laborCost", row.actual_labor_cost_minor],
                      ["expenseTotal", row.actual_expenses_minor],
                      ["billableValue", row.actual_billable_value_minor],
                      ["forecastCost", row.forecast_cost_minor],
                      ["forecastMargin", row.forecast_margin_minor],
                    ] as [FinanceKey, number | null][]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt>{t(label)}</dt>
                      <dd>{m(value)}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>{t("tracked")}</dt>
                    <dd>{hour(row.actual_minutes)}</dd>
                  </div>
                  <div>
                    <dt>{t("remaining")}</dt>
                    <dd>{hour(row.remaining_minutes)}</dd>
                  </div>
                </dl>
                {info && navigate && <div className="finance-project-actions">
                  <button type="button" className="text-button" onClick={() => navigate({ view: "finance", projectId: row.project_id, financeTab: "planning" })}>{t("planning")}</button>
                  <button type="button" className="text-button" onClick={() => navigate({ view: "finance", projectId: row.project_id, financeTab: "invoices" })}>{t("invoices")}</button>
                </div>}
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
