import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
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
import { ApiError } from "../api/ApiError";
import { routes } from "../app/routes";
import { DashboardRecentReports } from "../components/dashboard/DashboardRecentReports";
import { MonthlyCaseSummary } from "../components/dashboard/MonthlyCaseSummary";
import { OperationalQueueCard } from "../components/dashboard/OperationalQueueCard";
import { SecondaryMetric } from "../components/dashboard/SecondaryMetric";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";
import { useDashboard } from "../hooks/useDashboard";
import type { OperationalQueue } from "../domain/operationalQueue";

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
  description: string;
  icon: ReactNode;
  href: string;
}> = {
  needs_review: {
    label: "Needs Review",
    description: "Open submitted reports waiting for an office review decision.",
    icon: <ShieldCheck aria-hidden="true" />,
    href: routes.reportQueue("needs_review"),
  },
  needs_visit: {
    label: "Needs Visit",
    description: "Open submitted reports with field validation still incomplete.",
    icon: <ClipboardCheck aria-hidden="true" />,
    href: routes.fieldValidationQueue("needs_visit"),
  },
  follow_up_due: {
    label: "Follow-up Due",
    description: "Target visit date passed; validation remains incomplete.",
    icon: <CalendarClock aria-hidden="true" />,
    href: routes.fieldValidationQueue("follow_up_due"),
  },
  upcoming: {
    label: "Upcoming Visits",
    description: "Target visit date is today or later; validation remains incomplete.",
    icon: <CalendarDays aria-hidden="true" />,
    href: routes.fieldValidationQueue("upcoming"),
  },
};


const queueOrder: OperationalQueue[] = [
  "needs_review",
  "needs_visit",
  "follow_up_due",
  "upcoming",
];

export function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const dashboard = useDashboard(selectedMonth ?? undefined);
  const summary = dashboard.data;

  const activeMonth =
    selectedMonth ??
    (summary?.monthlySummary?.month ??
      summary?.recentReports?.[0]?.submittedAt?.slice(0, 7) ??
      new Date().toISOString().slice(0, 7));
  const isForbidden =
    dashboard.error instanceof ApiError && dashboard.error.status === 403;
  const isRateLimited =
    dashboard.error instanceof ApiError && dashboard.error.status === 429;
  const isMalformed = dashboard.error instanceof ZodError;
  const initialErrorMessage = isForbidden
    ? "Your account does not have access to the SRA Don Pedro dashboard."
    : isRateLimited
      ? "The dashboard is receiving too many requests. Wait a moment, then try again."
      : isMalformed
        ? "CaneGuard returned dashboard data in an unexpected format. Try again after the service is corrected."
        : "The dashboard could not be loaded from CaneGuard.";
  const refreshErrorMessage = isRateLimited
    ? "The latest refresh was rate limited. Wait a moment before trying again; the previous dashboard remains visible."
    : isMalformed
      ? "The latest response had an unexpected format. The previous dashboard remains visible."
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
        description="Incoming field reports and review queues for the SRA Don Pedro Mill District."
        actions={
          <>
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
                description={copy.description}
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
    </PageContent>
  );
}
