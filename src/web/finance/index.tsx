import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { createFinanceService } from "../../shared/finance-service";
import type { Membership, Project, Role, Workspace } from "../../shared/types";
import { useI18n } from "../i18n";
import { Field, Notice, Spinner } from "../components";
import { FinanceContext, type FinanceData, type FinanceNavigation, type FinanceNavigationTarget, type FinanceTab } from "./context";
import { financeError, ft, type FinanceKey } from "./catalog";
import { Overview } from "./overview";
import { Clients, Company } from "./clients-company";
import { Planning } from "./planning";
import { Invoices } from "./invoices";
import { Offers } from "./offers";
import "./finance.css";
export interface FinanceAreaProps {
  client: SupabaseClient;
  workspace: Workspace;
  members: Membership[];
  projects: Project[];
  role: Role;
  isDemo?: boolean;
  navigation?: FinanceNavigation;
  onNavigate?: (target: FinanceNavigationTarget) => void;
}
/** The outer guard unmounts financial data immediately on a role downgrade. */
export function FinanceArea(props: FinanceAreaProps) {
  return props.role === "owner" || props.role === "manager" ? (
    <AuthorizedFinance key={`${props.workspace.id}:${props.role}`} {...props} />
  ) : null;
}
function AuthorizedFinance({
  client,
  workspace,
  members,
  projects,
  role,
  isDemo = false,
  navigation,
  onNavigate,
}: FinanceAreaProps) {
  const { locale } = useI18n(),
    t = (key: FinanceKey) => ft(locale, key),
    service = useMemo(() => createFinanceService(client), [client]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspace.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    // oxlint-disable-next-line react/purity -- "heute" in der Workspace-Zeitzone; bewusst je Render aktuell.
  }).format(new Date());
  const [range, setRange] = useState({
      from: today.slice(0, 7) + "-01",
      to: today,
    }),
    [tab, setTab] = useState<FinanceTab>(navigation?.tab ?? "overview"),
    [projectId, setProjectId] = useState(navigation?.projectId ?? ""),
    [invoiceId, setInvoiceId] = useState(navigation?.invoiceId ?? ""),
    [receivedNavigation, setReceivedNavigation] = useState(navigation);
  // Apply browser/back context before children render, including open editors.
  // Only user events notify the workspace, so synchronization cannot push history.
  if (navigation && (
    receivedNavigation?.revision !== navigation.revision ||
    receivedNavigation?.projectId !== navigation.projectId ||
    receivedNavigation?.tab !== navigation.tab ||
    receivedNavigation?.invoiceId !== navigation.invoiceId
  )) {
    setReceivedNavigation(navigation);
    setTab(navigation.tab);
    setProjectId(navigation.projectId);
    setInvoiceId(navigation.invoiceId);
  }
  function changeTab(next: FinanceTab) {
    setTab(next);
    setSaved(false);
    onNavigate?.({ view: "finance", projectId, financeTab: next });
  }
  function changeProject(next: string) {
    setProjectId(next);
    setSaved(false);
    onNavigate?.({ view: "finance", projectId: next, financeTab: tab });
  }
  function navigate(target: FinanceNavigationTarget) {
    if (target.view === "finance") {
      setProjectId(target.projectId);
      setTab(target.financeTab ?? "overview");
      setSaved(false);
    }
    onNavigate?.(target);
  }
  const [data, setData] = useState<FinanceData | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saved, setSaved] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true),
    working = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      // oxlint-disable react-hooks/exhaustive-deps -- Mounted-/Generationszähler: .current im Cleanup ist der Zweck der Refs.
      mounted.current = false;
      generation.current++;
      // oxlint-enable react-hooks/exhaustive-deps
    };
  }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const [clients, profile, rates, plans, expenses, invoices, offers, overview] =
        await Promise.all([
          service.listClients(workspace.id),
          service.getProfile(workspace.id),
          service.listRates(workspace.id),
          service.listProjectPlans(workspace.id),
          service.listExpenses(workspace.id, range.from, range.to),
          service.listInvoices(workspace.id),
          service.listOffers(workspace.id),
          service.overview(workspace.id, range.from, range.to),
        ]);
      if (mounted.current && request === generation.current) {
        setData({
          clients,
          profile,
          rates,
          plans,
          expenses,
          invoices,
          offers,
          overview,
        });
        setError(null);
      }
    } catch (e) {
      if (mounted.current && request === generation.current) {
        setError(e);
        setData(null);
      }
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [service, workspace.id, range.from, range.to]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(action: () => Promise<unknown>, onSuccess?: () => void) {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
      if (!mounted.current) return false;
      onSuccess?.();
      await load();
      if (mounted.current) setSaved(true);
      return true;
    } catch (e) {
      if (mounted.current) {
        setError(e);
        if (
          typeof e === "object" &&
          e !== null &&
          "code" in e &&
          e.code === "forbidden"
        )
          setData(null);
      }
      return false;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function dates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget),
      from = String(f.get("from")),
      to = String(f.get("to"));
    if (from > to) {
      setError({ code: "validation" });
      return;
    }
    setRange({ from, to });
  }
  return (
    <div className="finance-area">
      <div className="finance-hero">
        <div>
          <p className="eyebrow">VAVE.LOG / {t("overview")}</p>
          <h2>{t("title")}</h2>
          <p>{t("intro")}</p>
        </div>
        <ArrowUpRight size={48} aria-hidden="true" />
      </div>
      <div className="finance-tabs">
      <div className="finance-tablist" role="tablist" aria-label={t("title")}>
        {(
          ["overview", "clients", "planning", "offers", "invoices", "company"] as const
        ).map((id) => (
          <button
            key={id}
            role="tab"
            id={`finance-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="finance-content"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => {
              const tabs = [
                "overview",
                "clients",
                "planning",
                "offers",
                "invoices",
                "company",
              ] as const;
              const index = tabs.indexOf(id);
              const next =
                event.key === "ArrowRight"
                  ? tabs[(index + 1) % tabs.length]
                  : event.key === "ArrowLeft"
                    ? tabs[(index + tabs.length - 1) % tabs.length]
                    : event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[tabs.length - 1]
                        : null;
              if (next) {
                event.preventDefault();
                changeTab(next);
                document.getElementById(`finance-tab-${next}`)?.focus();
              }
            }}
            onClick={() => {
              changeTab(id);
            }}
          >
            {t(id)}
          </button>
        ))}
      </div>
        <button
          className="icon-button"
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
          aria-label={t("retry")}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error != null && <Notice>{financeError(error, locale)}</Notice>}
      {saved && <Notice kind="success">{t("saved")}</Notice>}
      {(tab === "overview" || tab === "planning") && (
        <form
          className="finance-range"
          onSubmit={dates}
          key={`${range.from}:${range.to}`}
        >
          <Field label={t("from")}>
            <input
              type="date"
              name="from"
              min="2000-01-01"
              max="2100-12-31"
              required
              defaultValue={range.from}
            />
          </Field>
          <Field label={t("to")}>
            <input
              type="date"
              name="to"
              min="2000-01-01"
              max="2100-12-31"
              required
              defaultValue={range.to}
            />
          </Field>
          <button className="button secondary" disabled={busy || loading}>
            {t("apply")}
          </button>
          <p>{t("scope")}</p>
        </form>
      )}
      {loading &&
      (!data ||
        data.overview.from !== range.from ||
        data.overview.to !== range.to) ? (
        <Spinner label={t("loading")} />
      ) : !data ? (
        <button className="button secondary" onClick={() => void load()}>
          {t("retry")}
        </button>
      ) : (
        <FinanceContext.Provider
          value={{
            service,
            workspace,
            members,
            projects,
            role,
            locale,
            data,
            busy,
            isDemo,
            errorMessage: error == null ? null : financeError(error, locale),
            range,
            projectId,
            invoiceId,
            setProjectId: changeProject,
            navigate: onNavigate ? navigate : undefined,
            t,
            run,
          }}
        >
          <div
            key={`${tab}:${projectId}`}
            role="tabpanel"
            id="finance-content"
            aria-labelledby={`finance-tab-${tab}`}
          >
            {tab === "overview" && <Overview />}
            {tab === "clients" && <Clients />}
            {tab === "planning" && <Planning />}
            {tab === "invoices" && <Invoices />}
            {tab === "offers" && <Offers />}
            {tab === "company" && <Company />}
          </div>
        </FinanceContext.Provider>
      )}
    </div>
  );
}
