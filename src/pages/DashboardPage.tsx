import { Suspense, lazy, useState } from "react";
import { FileStack, RefreshCw, Rows3 } from "lucide-react";
import { Link } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { DashboardRecentReports } from "../components/dashboard/DashboardRecentReports";
import { OperationalSnapshot } from "../components/dashboard/OperationalSnapshot";
import { ScopeRuler } from "../components/dashboard/ScopeRuler";
import {
  dateDifferenceInDays,
  formatAsOfTime,
  formatWindow,
  resolveScope,
  type ScopeSelection,
} from "../components/dashboard/dashboardScope";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";
import { useAnalytics } from "../hooks/useAnalytics";
import { dashboardSummaryOptions, useDashboard } from "../hooks/useDashboard";
import { manilaDateAt, manilaMonthAt } from "../domain/reportingTime";

const MAX_ANALYTICS_RANGE_DAYS = 366;

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

function initialSelection(): ScopeSelection {
  const month = manilaMonthAt();
  const today = manilaDateAt();
  return { mode: "month", month, from: `${month}-01`, to: today };
}

export function DashboardPage() {
  const [selection, setSelection] = useState<ScopeSelection>(initialSelection);
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const scope = resolveScope(selection);
  const dashboard = useDashboard(scope.month, dashboardSummaryOptions);
  const rangeDays = dateDifferenceInDays(scope.from, scope.to) + 1;
  const rangeTooLong = rangeDays > MAX_ANALYTICS_RANGE_DAYS;
  const analytics = useAnalytics(
    {
      from: scope.from,
      to: scope.to,
      granularity: scope.granularity,
    },
    { enabled: !rangeTooLong },
  );
  const comparison = rangeTooLong ? undefined : analytics.data?.comparison;
  const previousAnalytics = useAnalytics(
    {
      from: comparison?.previousFrom ?? scope.from,
      to: comparison?.previousTo ?? scope.to,
      granularity: scope.granularity,
    },
    { enabled: !rangeTooLong && comparison !== undefined },
  );
  const summary = dashboard.data;
  const asOf = formatAsOfTime(dashboard.dataUpdatedAt);
  const scopeLabel = formatWindow(scope.from, scope.to);

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
          ? "Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL points to the same host and port as this Web preview."
          : "The dashboard could not be loaded from CaneGuard.";
  const refreshErrorMessage = isRateLimited
    ? "The latest refresh was rate limited. Wait a moment before trying again; the previous dashboard remains visible."
    : isMalformed
      ? "The latest response had an unexpected format. The previous dashboard remains visible."
      : isConnectionError
        ? "Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL; the previous dashboard remains visible."
        : "The latest refresh failed. Showing the most recently loaded dashboard.";

  return (
    <PageContent>
      <PageHeader
        eyebrow="SRA Don Pedro Mill District Office"
        title="Overview"
        description="Nasugbu, Batangas · synchronized field reports · period boundaries PHT (UTC+8)"
        actions={
          <>
            <ScopeRuler selection={selection} onChange={setSelection} />
            <p className="dashboard-last-updated" aria-live="polite">
              <RefreshCw
                className={dashboard.isFetching ? "spin" : ""}
                aria-hidden="true"
              />
              <span>Last updated</span>
              <strong>{asOf}</strong>
            </p>
            <Button
              type="button"
              variant="secondary"
              icon={<FileStack aria-hidden="true" />}
              onClick={() => setReportBuilderOpen(true)}
            >
              Generate report
            </Button>
            <Link className="button button--secondary" to={routes.reports}>
              <Rows3 aria-hidden="true" />
              <span>View all reports</span>
            </Link>
            <Button
              type="button"
              icon={<RefreshCw className={dashboard.isFetching ? "spin" : ""} aria-hidden="true" />}
              disabled={dashboard.isFetching}
              onClick={() => dashboard.refetch()}
            >
              {dashboard.isFetching ? "Refreshing..." : "Refresh dashboard"}
            </Button>
          </>
        }
      />

      {dashboard.isRefetchError ? (
        <div className="dashboard-refresh-warning" role="alert">
          {refreshErrorMessage}
        </div>
      ) : null}

      {dashboard.isError && !summary ? (
        <ErrorState
          message={initialErrorMessage}
          onRetry={isForbidden ? undefined : () => dashboard.refetch()}
        />
      ) : (
        <>
          <section
            className="dashboard-section"
            aria-labelledby="operational-snapshot-heading"
            aria-busy={dashboard.isPending || analytics.isPending}
          >
            <div className="dashboard-section__heading">
              <h2 id="operational-snapshot-heading">Operational snapshot</h2>
            </div>
            {!summary ? (
              <>
                <span className="sr-only">Loading the operational snapshot…</span>
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
                analytics={rangeTooLong ? undefined : analytics.data}
                analyticsPending={rangeTooLong ? false : analytics.isPending}
                analyticsFailed={rangeTooLong ? true : analytics.isError}
                scope={scope}
                asOf={asOf}
              />
            )}
            {rangeTooLong ? (
              <p className="dashboard-scope-note" role="alert">
                Custom range cannot exceed 366 days. Shorten the range to load
                the period comparison.
              </p>
            ) : null}
          </section>

          <section
            className="report-workspace dashboard-recent"
            aria-labelledby="recent-reports-heading"
            aria-busy={dashboard.isPending}
          >
            <div className="workspace-heading">
              <div>
                <h2 id="recent-reports-heading">Recent reports</h2>
              </div>
              {summary ? (
                <span className="workspace-heading__meta">
                  {summary.recentReports.length} most recent synchronized
                  submissions · as of {asOf} PHT
                </span>
              ) : null}
            </div>

            {!summary ? (
              <>
                <span className="sr-only">Loading recent reports…</span>
                <div aria-hidden="true">
                  <Skeleton label="Loading recent reports" />
                </div>
              </>
            ) : summary.recentReports.length === 0 ? (
              <EmptyState
                title="No submitted reports yet"
                message="Reports appear here once a device synchronizes."
              />
            ) : (
              <DashboardRecentReports reports={summary.recentReports} />
            )}
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="decision-visualizations-heading"
            aria-busy={analytics.isPending || previousAnalytics.isPending}
          >
            <div className="dashboard-section__heading">
              <h2 id="decision-visualizations-heading">Decision visualizations</h2>
            </div>
            {!analytics.data ? (
              <>
                <span className="sr-only">Loading decision visualizations…</span>
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
                    analytics={analytics.data}
                    previousSeries={previousAnalytics.data?.series ?? []}
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
                    analytics={analytics.data}
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
                    analytics={analytics.data}
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
                    rows={analytics.data.validationByBarangay}
                    scopeLabel={scopeLabel}
                    from={scope.from}
                    to={scope.to}
                  />
                </Suspense>
              </div>
            )}
          </section>
        </>
      )}

      <ReportDocumentBuilder
        open={reportBuilderOpen}
        onClose={() => setReportBuilderOpen(false)}
      />
    </PageContent>
  );
}
