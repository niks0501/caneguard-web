import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  CircleHelp,
  Clock3,
  FileStack,
  RefreshCw,
  Rows3,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { AnalyticsSection } from "../components/dashboard/AnalyticsSection";
import { DashboardRecentReports } from "../components/dashboard/DashboardRecentReports";
import { ExpertVerificationPanel } from "../components/dashboard/ExpertVerificationPanel";
import { MonthlyCaseSummary } from "../components/dashboard/MonthlyCaseSummary";
import { OperationalQueueCard } from "../components/dashboard/OperationalQueueCard";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { SecondaryMetric } from "../components/dashboard/SecondaryMetric";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";
import { useDashboard } from "../hooks/useDashboard";
import type { OperationalQueue } from "../domain/operationalQueue";
import { manilaMonthAt } from "../domain/reportingTime";

function formatRefreshTime(timestamp: number) {
  if (!timestamp) return "Not refreshed yet";

  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

const queueCopy: Record<OperationalQueue, {
  label: string;
  icon: ReactNode;
  href: string;
}> = {
  needs_review: {
    label: "Needs Review",
    icon: <ShieldCheck aria-hidden="true" />,
    href: routes.reportQueue("needs_review"),
  },
  needs_visit: {
    label: "Needs Visit",
    icon: <ClipboardCheck aria-hidden="true" />,
    href: routes.fieldValidationQueue("needs_visit"),
  },
  follow_up_due: {
    label: "Follow-up Due",
    icon: <CalendarClock aria-hidden="true" />,
    href: routes.fieldValidationQueue("follow_up_due"),
  },
  upcoming: {
    label: "Upcoming Visits",
    icon: <CalendarDays aria-hidden="true" />,
    href: routes.fieldValidationQueue("upcoming"),
  },
  unverified_no_active_work: {
    label: "Unverified, no active work",
    icon: <Rows3 aria-hidden="true" />,
    href: routes.reportQueue("unverified_no_active_work"),
  },
};


const queueOrder: OperationalQueue[] = [
  "needs_review",
  "needs_visit",
  "follow_up_due",
  "upcoming",
  "unverified_no_active_work",
];

export function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(manilaMonthAt);
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
  const [analyticsRequested, setAnalyticsRequested] = useState(false);
  const dashboard = useDashboard(selectedMonth);
  const summary = dashboard.data;

  const activeMonth = selectedMonth;
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

  if (dashboard.isPending) {
    return (
      <PageContent>
        <LoadingState message="Loading the SRA Don Pedro report overview..." />
      </PageContent>
    );
  }

  if (dashboard.isError && !summary) {
    return (
      <PageContent>
        <ErrorState
          message={initialErrorMessage}
          onRetry={isForbidden ? undefined : () => dashboard.refetch()}
        />
      </PageContent>
    );
  }

  if (!summary) return null;

  return (
    <PageContent>
      <PageHeader
        title="CaneGuard dashboard"
        actions={
          <>
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

      <section className="dashboard-operational-section" aria-labelledby="operational-queues-heading">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="operational-queues-heading">Operational queues</h2>
          </div>
        </div>
        <div className="dashboard-operational-queues">
          {queueOrder.map((queue) => {
            const copy = queueCopy[queue];
            return (
              <OperationalQueueCard
                key={queue}
                queue={queue}
                label={copy.label}
                count={summary.queues?.[queue] ?? 0}
                href={copy.href}
                icon={copy.icon}
              />
            );
          })}
        </div>
      </section>

      <section className="report-workspace dashboard-recent" aria-labelledby="recent-reports-heading">
        <div className="workspace-heading">
          <div>
            <h2 id="recent-reports-heading">Recent reports</h2>
          </div>
          <span className="workspace-heading__meta">{summary.recentReports.length} latest submissions</span>
        </div>

        {summary.recentReports.length === 0 ? (
          <EmptyState />
        ) : (
          <DashboardRecentReports reports={summary.recentReports} />
        )}
      </section>

      {summary.monthlySummary ? (
        <MonthlyCaseSummary
          summary={summary.monthlySummary}
          month={activeMonth}
          onMonthChange={setSelectedMonth}
        />
      ) : null}

      <details
        className="dashboard-secondary-analytics"
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setAnalyticsExpanded(open);
          if (open) setAnalyticsRequested(true);
        }}
      >
        <summary>
          <span>
            <strong>Detailed analytics and historical totals</strong>
            <span>Comparisons, lifecycle, workload, turnaround and expert consultation</span>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        {analyticsRequested ? (
          <div className="dashboard-secondary-analytics__content" hidden={!analyticsExpanded}>
            <AnalyticsSection />
            <ExpertVerificationPanel month={activeMonth} />
            <section className="dashboard-metrics-band dashboard-history-band" aria-label="Historical report totals">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Report totals</h2>
                </div>
                <p className="dashboard-refreshed" aria-live="polite">
                  <RefreshCw aria-hidden="true" />
                  <span>Last refreshed</span>
                  <strong>{formatRefreshTime(dashboard.dataUpdatedAt)}</strong>
                </p>
              </div>
              <section className="dashboard-secondary-row" aria-label="Historical report status totals">
                <SecondaryMetric
                  label="Total submitted"
                  value={summary.totalSubmitted}
                  icon={<FileStack aria-hidden="true" />}
                />
                <SecondaryMetric
                  label="Verified by staff"
                  value={summary.counts.verified_by_staff}
                  icon={<CheckCircle2 aria-hidden="true" />}
                />
                <SecondaryMetric
                  label="Unable to verify"
                  value={summary.counts.unable_to_verify}
                  icon={<CircleHelp aria-hidden="true" />}
                />
                <SecondaryMetric
                  label="Resolved"
                  value={summary.counts.resolved}
                  icon={<Clock3 aria-hidden="true" />}
                />
              </section>
            </section>
          </div>
        ) : null}
      </details>
      <ReportDocumentBuilder
        open={reportBuilderOpen}
        onClose={() => setReportBuilderOpen(false)}
      />
    </PageContent>
  );
}
