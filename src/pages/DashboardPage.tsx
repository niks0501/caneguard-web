import {
  BadgeCheck,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileStack,
  MapPin,
  RefreshCw,
  Rows3,
} from "lucide-react";
import { Link } from "react-router";
import { ApiError } from "../api/ApiError";
import { routes } from "../app/routes";
import { DashboardRecentReports } from "../components/dashboard/DashboardRecentReports";
import { SecondaryMetric } from "../components/dashboard/SecondaryMetric";
import { PageContent, PageHeader } from "../components/layout/Page";
import { MetricCard } from "../components/reports/MetricCard";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";
import { useDashboard } from "../hooks/useDashboard";

function formatRefreshTime(timestamp: number) {
  if (!timestamp) return "Not refreshed yet";

  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export function DashboardPage() {
  const dashboard = useDashboard();
  const summary = dashboard.data;
  const isForbidden =
    dashboard.error instanceof ApiError && dashboard.error.status === 403;

  if (dashboard.isPending) {
    return (
      <PageContent>
        <LoadingState message="Loading the municipal report overview..." />
      </PageContent>
    );
  }

  if (dashboard.isError && !summary) {
    return (
      <PageContent>
        <ErrorState
          message={
            isForbidden
              ? "Your account does not have access to the municipal dashboard."
              : "The dashboard could not be loaded from CaneGuard."
          }
          onRetry={isForbidden ? undefined : () => dashboard.refetch()}
        />
      </PageContent>
    );
  }

  if (!summary) return null;

  return (
    <PageContent>
      <PageHeader
        eyebrow="Municipal overview"
        title="CaneGuard dashboard"
        description="Track incoming field observations and the staff review queue at a glance."
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
          The latest refresh failed. Showing the most recently loaded dashboard.
        </div>
      ) : null}

      <section className="dashboard-primary-metrics" aria-label="Report overview">
        <MetricCard
          label="Total submitted"
          value={String(summary.totalSubmitted)}
          context="All synchronized field reports"
          icon={<FileStack aria-hidden="true" />}
        />
        <MetricCard
          label="Submitted–unverified"
          value={String(summary.counts.submitted_unverified)}
          context="Awaiting staff review"
          icon={<Clock3 aria-hidden="true" />}
        />
        <MetricCard
          label="For field validation"
          value={String(summary.counts.for_field_validation)}
          context="Requires an on-site follow-up"
          icon={<MapPin aria-hidden="true" />}
        />
        <MetricCard
          label="Verified by staff"
          value={String(summary.counts.verified_by_staff)}
          context="Evidence reviewed by staff"
          icon={<BadgeCheck aria-hidden="true" />}
        />
      </section>

      <section className="dashboard-secondary-row" aria-label="Additional report status totals">
        <SecondaryMetric
          label="Unable to verify"
          value={summary.counts.unable_to_verify}
          icon={<CircleHelp aria-hidden="true" />}
        />
        <SecondaryMetric
          label="Resolved"
          value={summary.counts.resolved}
          icon={<CheckCircle2 aria-hidden="true" />}
        />
        <p className="dashboard-refreshed" aria-live="polite">
          <RefreshCw aria-hidden="true" />
          <span>Last refreshed</span>
          <strong>{formatRefreshTime(dashboard.dataUpdatedAt)}</strong>
        </p>
      </section>

      <section className="report-workspace dashboard-recent" aria-labelledby="recent-reports-heading">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Latest field activity</p>
            <h2 id="recent-reports-heading">Recent reports</h2>
          </div>
          <span>{summary.recentReports.length} latest submissions</span>
        </div>

        {summary.recentReports.length === 0 ? (
          <EmptyState />
        ) : (
          <DashboardRecentReports reports={summary.recentReports} />
        )}
      </section>
    </PageContent>
  );
}
