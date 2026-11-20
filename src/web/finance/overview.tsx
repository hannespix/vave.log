import { ArrowDownToLine, TriangleAlert } from "lucide-react";
import { FinanceProjectFilter, ProjectLink, useFinance, useFinanceProject } from "./context";
import { money, overviewCsv, localeCode } from "./documents";
import { dateInZone, downloadText } from "../helpers";
import type { FinanceKey } from "./catalog";
import { summarizeInvoices } from "./invoice-summary";
export function Overview() {
  const { data, locale, workspace, projects, range, t, navigate } = useFinance(),
    { projectId: project, setProjectId: setProject, available } = useFinanceProject();
  const rows = data.overview.projects.filter(
      (p) => available && (!project || p.project_id === project),
    ),
    m = (value: number | null) => money(value, workspace.currency, locale);
  const invoiceTotals = summarizeInvoices(available ? data.invoices : [], range, project, dateInZone(workspace.timezone));
  const date = (value: string) =>
    new Intl.DateTimeFormat(localeCode(locale), {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  const total = (
    field:
      | "planned_revenue_minor"
      | "period_cost_minor"
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
            ["actualCost", total("period_cost_minor")],
            ["forecastMargin", total("forecast_margin_minor")],
          ] as [FinanceKey, number | null][]
        ).map(([label, value]) => (
          <div key={label} className={`finance-metric${value === null ? " finance-metric-missing" : ""}`}>
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
          {invoiceTotals.overdueCount > 0 && (
            <div className="finance-metric finance-metric-overdue">
              <span>{t("overdueNet")}</span>
              <strong>{m(invoiceTotals.overdueNet)}</strong>
              <small>
                {invoiceTotals.overdueCount} {t("overdueCountNote")}
              </small>
            </div>
          )}
        </div>
        {invoiceTotals.paidNet + invoiceTotals.openNet > 0 && (() => {
          const all = invoiceTotals.paidNet + invoiceTotals.openNet, due = invoiceTotals.openNet - invoiceTotals.overdueNet;
          const parts = ([["paidNet", invoiceTotals.paidNet, "pay-paid"], ["openNet", due, "pay-open"], ["overdueNet", invoiceTotals.overdueNet, "pay-overdue"]] as [FinanceKey, number, string][]).filter((x) => x[1] > 0);
          return (
            <div className="finance-paybar" role="img" aria-label={parts.map(([label, value]) => `${t(label)}: ${m(value)}`).join(", ")}>
              <div className="finance-paybar-track">
                {parts.map(([label, value, cls]) => <i key={label} className={cls} style={{ width: `${(value / all) * 100}%` }} />)}
              </div>
              <p className="finance-paybar-legend" aria-hidden="true">
                {parts.map(([label, value, cls]) => <span key={label}><i className={cls} />{t(label)} · {Math.round((value / all) * 100)} %</span>)}
              </p>
            </div>
          );
        })()}
        <p className="finance-caption">{t("invoiceSummaryNote")}</p>
      </section>
      {rows.length === 0 ? (
        <div className="panel muted">{t(available ? "noProjects" : "projectUnavailable")}</div>
      ) : (
        <section className="finance-plans" aria-labelledby="finance-plans-title">
          <div className="finance-summary-heading">
            <h2 id="finance-plans-title">{t("plan")}</h2>
          </div>
          <div className="finance-projects">
          {rows.map((row) => {
            const info = projects.find((p) => p.id === row.project_id);
            const missing = row.missing_cost_entries + row.missing_estimate_costs + row.missing_bill_entries;
            const share = row.period_cost_minor !== null && row.planned_cost_minor ? Math.round((row.period_cost_minor / row.planned_cost_minor) * 100) : null;
            const margin = row.forecast_margin_minor;
            return (
              <article key={row.project_id} className="panel finance-panel finance-plan-card">
                <header className="plan-card-head">
                  <div>
                    <h3 className="finance-project-name">
                      <ProjectLink projectId={row.project_id} />
                    </h3>
                    <small className="muted">{info?.code}</small>
                  </div>
                  <span className="badge">{t(row.billing_mode)}</span>
                </header>
                {missing > 0 && (
                  <p className="plan-card-warning">
                    <TriangleAlert size={15} aria-hidden="true" />
                    <span>{t("ratesMissingShort")} ({missing})</span>
                    {info && navigate && <button type="button" className="text-button" onClick={() => navigate({ view: "finance", projectId: row.project_id, financeTab: "planning" })}>{t("fixRates")}</button>}
                  </p>
                )}
                <dl className="plan-card-figures">
                  <div>
                    <dt>{t("plannedRevenue")}</dt>
                    <dd>{m(row.planned_revenue_minor)}</dd>
                  </div>
                  <div>
                    <dt>{t("forecastCost")}</dt>
                    <dd className={row.forecast_cost_minor === null ? "plan-card-missing" : ""}>{m(row.forecast_cost_minor)}</dd>
                  </div>
                  <div>
                    <dt>{t("forecastMargin")}</dt>
                    <dd className={margin === null ? "plan-card-missing" : margin < 0 ? "plan-card-neg" : "plan-card-pos"}>{m(margin)}</dd>
                  </div>
                </dl>
                <div className="plan-card-bar">
                  <div className="plan-card-bar-text">
                    <span>{t("periodCost")} <strong className={row.period_cost_minor === null ? "plan-card-missing" : ""}>{m(row.period_cost_minor)}</strong></span>
                    <span>{t("plannedCost")} <strong>{m(row.planned_cost_minor)}</strong></span>
                  </div>
                  <div className="util-track" aria-hidden="true">
                    {share !== null && <div className={share > 100 ? "util-over" : ""} style={{ width: `${Math.min(share, 100)}%` }} />}
                  </div>
                </div>
                <p className="plan-card-hours">
                  <span>{t("tracked")} <strong>{hour(row.actual_minutes)}</strong></span>
                  <span>{t("remaining")} <strong>{hour(row.remaining_minutes)}</strong></span>
                </p>
                <details className="plan-card-all">
                  <summary>{t("allFigures")}</summary>
                  <dl className="finance-details">
                    {(
                      [
                        ["plannedRevenue", row.planned_revenue_minor],
                        ["plannedCost", row.planned_cost_minor],
                        ["plannedMargin", row.planned_margin_minor],
                        ["periodCost", row.period_cost_minor],
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
                  </dl>
                </details>
                {info && navigate && <div className="finance-project-actions">
                  <button type="button" className="text-button" onClick={() => navigate({ view: "finance", projectId: row.project_id, financeTab: "planning" })}>{t("planning")}</button>
                  <button type="button" className="text-button" onClick={() => navigate({ view: "finance", projectId: row.project_id, financeTab: "invoices" })}>{t("invoices")}</button>
                </div>}
              </article>
            );
          })}
          </div>
        </section>
      )}
    </>
  );
}
