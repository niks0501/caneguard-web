import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { FileStack, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { DASHBOARD_TIMEZONE_LABEL } from "../components/dashboard/analyticsCopy";
import { serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";
import { morningNote } from "../components/dashboard/morningNote";
import { DashboardRecentReports } from "../components/dashboard/DashboardRecentReports";
import { OperationalSnapshot } from "../components/dashboard/OperationalSnapshot";
import { ScopeRuler } from "../components/dashboard/ScopeRuler";
import {
  readDashboardPreferences,
  saveDashboardScope,
} from "../components/dashboard/dashboardPreferences";
import {
  dateDifferenceInDays,
  formatAsOfTime,
  formatWindow,
  resolveScope,
  type ScopeSelection,
} from "../components/dashboard/dashboardScope";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { printableScopeFromReportFilters } from "../components/reports/reportBuilderScope";
import { PageContent } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";
import { useAnalytics } from "../hooks/useAnalytics";
import { dashboardSummaryOptions, useDashboard } from "../hooks/useDashboard";

const MAX_ANALYTICS_RANGE_DAYS = 366;

const DASHBOARD_TABS = [
  { id: "today", label: "Today" },
  { id: "trends", label: "Trends" },
] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number]["id"];

const InflowComparisonBars = lazy(() =>
  import("../components/dashboard/InflowComparisonBars").then((module) => ({
    default: module.InflowComparisonBars,
  })),
);
const ConcernVsConditionBars = lazy(() =>
  import("../components/dashboard/ConcernVsConditionBars").then((module) => ({
    default: module.ConcernVsConditionBars,
  })),
);
const BarangayValidationBars = lazy(() =>
  import("../components/dashboard/BarangayValidationBars").then((module) => ({
    default: module.BarangayValidationBars,
  })),
);
const ReportLocationMap = lazy(() =>
  import("../components/dashboard/ReportLocationMap").then((module) => ({
    default: module.ReportLocationMap,
  })),
);

export function DashboardPage() {
  // The scope ruler's last-chosen mode and window survive leaving the page and
  // reloading it; a missing or unreadable stored value falls back to the
  // current PHT month to date (see dashboardPreferences.ts).
  const [selection, setSelection] = useState<ScopeSelection>(
    () => readDashboardPreferences().selection,
  );
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("today");

  useEffect(() => {
    saveDashboardScope(selection);
  }, [selection]);

  const scope = resolveScope(selection);
  const dashboard = useDashboard(scope.month, dashboardSummaryOptions);
  const rangeDays = dateDifferenceInDays(scope.from, scope.to) + 1;
  const rangeTooLong = rangeDays > MAX_ANALYTICS_RANGE_DAYS;
  const analytics = useAnalytics(
    {
      from: scope.from,
      to: scope.to,
      granularity: scope.granularity,
      ...(scope.comparison ? { comparison: scope.comparison } : {}),
    },
    { enabled: !rangeTooLong },
  );
  const scopedAnalytics = !rangeTooLong && !analytics.isPlaceholderData &&
    analytics.data?.period.from === scope.from && analytics.data.period.to === scope.to
    ? analytics.data : undefined;
  const analyticsUnavailable = rangeTooLong || analytics.isError;
  const analyticsSettled = analyticsUnavailable && !analytics.isFetching;
  const analyticsBusy = !scopedAnalytics && !analyticsSettled;
  const summary = dashboard.data;
  const initialLoadFailed = dashboard.isError && !summary;
  const asOf = formatAsOfTime(dashboard.dataUpdatedAt);
  const scopeLabel = `${formatWindow(scope.from, scope.to)}${scope.comparison ? " · month to date" : ""}`;
  const printableScope = useMemo(
    () => printableScopeFromReportFilters({ dateFrom: scope.from, dateTo: scope.to }),
    [scope.from, scope.to],
  );

  const isForbidden =
    dashboard.error instanceof ApiError && dashboard.error.status === 403;
  const isRateLimited =
    dashboard.error instanceof ApiError && dashboard.error.status === 429;
  const isMalformed = dashboard.error instanceof ZodError;
  const isConnectionError = isApiConnectionError(dashboard.error);
  const initialErrorMessage = isForbidden
    ? "Your account does not have access to the SRA Don Pedro dashboard."
    : isRateLimited
      ? "The dashboard is receiving too many requests. Wait a moment, then try again."
      : isMalformed
        ? "CaneGuard returned dashboard data in an unexpected format. Try again after the service is corrected."
        : isConnectionError
          ? serviceUnreachableMessage
          : "The dashboard could not be loaded from CaneGuard.";
  const refreshErrorMessage = isRateLimited
    ? "The latest refresh was rate limited. Wait a moment before trying again; the previous dashboard remains visible."
    : isMalformed
      ? "The latest response had an unexpected format. The previous dashboard remains visible."
      : isConnectionError
        ? serviceUnreachableWhileShowingData
        : "The latest refresh failed. Showing the most recently loaded dashboard.";

  return (
    <PageContent>
      <header className="page-header dashboard-header">
        <div className="dashboard-header__main">
          <div className="dashboard-header__identity">
            <p className="eyebrow">SRA Don Pedro Mill District Office</p>
            <h1>Overview</h1>
            <p className="dashboard-header__description">
              {`Nasugbu, Batangas · times ${DASHBOARD_TIMEZONE_LABEL}`}
            </p>
          </div>
          <div className="dashboard-header__context">
            <p className="dashboard-last-updated" aria-live="polite">
              <RefreshCw
                className={dashboard.isFetching ? "spin" : ""}
                aria-hidden="true"
              />
              <span>Last updated</span>
              <strong>{asOf}</strong>
            </p>
          </div>
        </div>
        <div className="dashboard-header__actions">
          <Button
            type="button"
            icon={<RefreshCw className={dashboard.isFetching ? "spin" : ""} aria-hidden="true" />}
            disabled={dashboard.isFetching}
            onClick={() => dashboard.refetch()}
          >
            {dashboard.isFetching ? "Refreshing..." : "Refresh dashboard"}
          </Button>
        </div>
      </header>

      {initialLoadFailed ? null : (
        <div className="dashboard-tabs" role="tablist" aria-label="Overview views">
          {DASHBOARD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`dashboard-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={
                activeTab === tab.id ? `dashboard-panel-${tab.id}` : undefined
              }
              tabIndex={activeTab === tab.id ? 0 : -1}
              className="dashboard-tabs__tab"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const next = tab.id === "today" ? "trends" : "today";
                setActiveTab(next);
                document.getElementById(`dashboard-tab-${next}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {dashboard.isRefetchError ? (
        <div className="dashboard-refresh-warning" role="alert">
          {refreshErrorMessage}
        </div>
      ) : null}

      {initialLoadFailed ? (
        <ErrorState
          message={initialErrorMessage}
          onRetry={isForbidden ? undefined : () => dashboard.refetch()}
        />
      ) : activeTab === "today" ? (
        <div
          className="dashboard-sections"
          role="tabpanel"
          id="dashboard-panel-today"
          aria-labelledby="dashboard-tab-today"
        >
          {summary ? (
            <p className="dashboard-note">{morningNote(summary.queues)}</p>
          ) : null}
          <section
            className="dashboard-section"
            aria-labelledby="current-operations-heading"
            aria-busy={dashboard.isPending || analyticsBusy}
          >
            <div className="dashboard-section__heading">
              <h2 id="current-operations-heading">Current operations</h2>
              <p className="dashboard-section__meta">
                {formatWindow(scope.from, scope.to)}
              </p>
            </div>
            {!summary ? (
              <>
                <span className="sr-only">Loading current operations…</span>
                <div className="dashboard-grid" aria-hidden="true">
                  <div className="col-3"><Skeleton label="Loading submitted reports" /></div>
                  <div className="col-3"><Skeleton label="Loading the review queue" /></div>
                  <div className="col-3"><Skeleton label="Loading field-validation work" /></div>
                  <div className="col-3"><Skeleton label="Loading unverified reports" /></div>
                </div>
              </>
            ) : (
              <OperationalSnapshot
                summary={summary}
                analytics={scopedAnalytics}
                analyticsFailed={analyticsUnavailable}
                monthToDate={scope.comparison !== undefined}
              />
            )}
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="recent-reports-heading"
            aria-busy={dashboard.isPending}
          >
            <div className="dashboard-section__heading">
              <h2 id="recent-reports-heading">Recent reports</h2>
            </div>

            {!summary ? (
              <>
                <span className="sr-only">Loading recent reports…</span>
                <div aria-hidden="true">
                  <Skeleton label="Loading recent reports" />
                </div>
              </>
            ) : summary.recentReports.length === 0 ? (
              <div className="dashboard-card">
                <EmptyState
                  title="No submitted reports yet"
                  message="Reports appear here once a device synchronizes."
                />
              </div>
            ) : (
              <div className="dashboard-card dashboard-card--table">
                <DashboardRecentReports reports={summary.recentReports} />
              </div>
            )}
            {summary && summary.recentReports.length > 0 ? (
              <p className="dashboard-table-line">
                <span>{`Latest ${summary.recentReports.length} ${summary.recentReports.length === 1 ? "report" : "reports"}`}</span>
                <Link to={routes.reports}>View all reports</Link>
              </p>
            ) : null}
          </section>
        </div>
      ) : (
        <div
          className="dashboard-sections"
          role="tabpanel"
          id="dashboard-panel-trends"
          aria-labelledby="dashboard-tab-trends"
        >
          <div className="dashboard-trends-controls">
            <ScopeRuler selection={selection} onChange={setSelection} />
            <Button
              type="button"
              variant="secondary"
              icon={<FileStack aria-hidden="true" />}
              onClick={() => setReportBuilderOpen(true)}
            >
              Generate report
            </Button>
            {rangeTooLong ? (
              <p className="dashboard-scope-note" role="alert">
                Custom range cannot exceed 366 days. Shorten the range to load
                the period comparison.
              </p>
            ) : null}
          </div>
          <section
            className="dashboard-section"
            aria-labelledby="trends-analysis-heading"
            aria-busy={analyticsBusy}
          >
            <div className="dashboard-section__heading">
              <h2 id="trends-analysis-heading">Trends and analysis</h2>
            </div>
            {rangeTooLong ? (
              <p className="dashboard-section__meta">
                Charts are unavailable for this range.
              </p>
            ) : !scopedAnalytics && analyticsSettled ? (
              <ErrorState message="Report analytics unavailable for the selected period." onRetry={() => analytics.refetch()} />
            ) : !scopedAnalytics ? (
              <>
                <span className="sr-only">Loading trends and analysis…</span>
                <div className="dashboard-grid" aria-hidden="true">
                  <div className="col-6"><Skeleton label="Loading inflow comparison" /></div>
                  <div className="col-6"><Skeleton label="Loading concern comparison" /></div>
                  <div className="col-12"><Skeleton label="Loading barangay validation" /></div>
                </div>
              </>
            ) : (
              <div className="dashboard-grid">
                <Suspense
                  fallback={
                    <div className="col-6" aria-hidden="true">
                      <Skeleton label="Loading inflow comparison" />
                    </div>
                  }
                >
                  <InflowComparisonBars
                    analytics={scopedAnalytics}
                    previousSeries={scopedAnalytics.comparison.previousSeries}
                    scopeLabel={scopeLabel}
                  />
                </Suspense>
                <Suspense
                  fallback={
                    <div className="col-6" aria-hidden="true">
                      <Skeleton label="Loading concern comparison" />
                    </div>
                  }
                >
                  <ConcernVsConditionBars
                    analytics={scopedAnalytics}
                    scopeLabel={scopeLabel}
                  />
                </Suspense>
                <Suspense
                  fallback={
                    <div className="col-12" aria-hidden="true">
                      <Skeleton label="Loading barangay validation" />
                    </div>
                  }
                >
                  <BarangayValidationBars
                    analytics={scopedAnalytics}
                    scopeLabel={scopeLabel}
                  />
                </Suspense>
                <Suspense
                  fallback={
                    <div className="col-12" aria-hidden="true">
                      <Skeleton label="Loading field-report map" />
                    </div>
                  }
                >
                  <ReportLocationMap
                    rows={scopedAnalytics.validationByBarangay}
                    scopeLabel={scopeLabel}
                    from={scope.from}
                    to={scope.to}
                  />
                </Suspense>
              </div>
            )}
          </section>
        </div>
      )}

      <ReportDocumentBuilder
        open={reportBuilderOpen}
        onClose={() => setReportBuilderOpen(false)}
        scope={printableScope}
      />
    </PageContent>
  );
}
