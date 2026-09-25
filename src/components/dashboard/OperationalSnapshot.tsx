import {
  CalendarClock,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Rows3,
  ShieldCheck,
} from "lucide-react";
import { routes } from "../../app/routes";
import type {
  DashboardSummary,
  ReportAnalytics,
} from "../../domain/dashboard.types";
import { AgeLadder } from "./AgeLadder";
import { KpiCard } from "./KpiCard";
import { Sparkline } from "./Sparkline";
import { formatWindow } from "./dashboardScope";

/**
 * Section A — Operational snapshot (overhaul §3.2). Four KPI cards; the two
 * calendar subsets of the field-validation queue (past target date and
 * scheduled ahead) are labelled segments inside KPI 3, never peer cards.
 * Queue KPIs are marked "now" because they are current-state counts, not
 * period-scoped ones; only KPI 1 (period-scoped submissions) carries a real
 * previous-window comparison. Freshness is stamped once in the page header.
 */
export function OperationalSnapshot({
  summary,
  analytics,
  analyticsFailed,
}: {
  summary: DashboardSummary;
  analytics?: ReportAnalytics;
  analyticsPending?: boolean;
  analyticsFailed: boolean;
}) {
  const unscheduled = Math.max(
    0,
    summary.queues.needs_visit -
      summary.queues.follow_up_due -
      summary.queues.upcoming,
  );

  return (
    <div className="dashboard-grid">
      <div className="col-3">
        <KpiCard
          label="Submitted reports"
          value={analytics ? String(analytics.totalSubmitted) : "—"}
          icon={<Rows3 aria-hidden="true" strokeWidth={1.75} />}
          href={routes.reports}
          linkLabel="Open the submitted reports register"
        >
          {analytics ? (
            <Sparkline
              points={analytics.series.map((point) => point.count)}
              label={`Submissions ${formatWindow(analytics.period.from, analytics.period.to)}`}
            />
          ) : null}
        </KpiCard>
      </div>
      <div className="col-3">
        <KpiCard
          label="Awaiting review"
          value={String(summary.queues.needs_review)}
          icon={<ShieldCheck aria-hidden="true" strokeWidth={1.75} />}
          pointInTime
          href={routes.reportQueue("needs_review")}
          linkLabel="Open the Awaiting review queue"
          emptyMessage={
            summary.queues.needs_review === 0 ? "Nothing awaiting review." : undefined
          }
        >
          {analytics && summary.queues.needs_review > 0 ? (
            <AgeLadder
              label="Waiting age"
              segments={analytics.reviewBacklog.buckets.map((bucket) => ({
                label: bucket.label,
                count: bucket.count,
              }))}
            />
          ) : null}
          {!analytics && !analyticsFailed && summary.queues.needs_review > 0 ? (
            <div className="skeleton skeleton--ladder" aria-hidden="true" />
          ) : null}
        </KpiCard>
      </div>
      <div className="col-3">
        <KpiCard
          label="Needing field validation"
          value={String(summary.queues.needs_visit)}
          icon={<ClipboardCheck aria-hidden="true" strokeWidth={1.75} />}
          pointInTime
          href={routes.fieldValidationQueue("needs_visit")}
          linkLabel="Open the Needing field validation queue"
          emptyMessage={
            summary.queues.needs_visit === 0
              ? "No open field-validation work."
              : undefined
          }
          segments={
            summary.queues.needs_visit === 0
              ? []
              : [
                  {
                    label: "Past target date",
                    count: summary.queues.follow_up_due,
                    href: routes.fieldValidationQueue("follow_up_due"),
                    linkLabel: "Open the Past target date queue",
                    icon: <CalendarClock aria-hidden="true" strokeWidth={1.75} />,
                  },
                  {
                    label: "Scheduled ahead",
                    count: summary.queues.upcoming,
                    href: routes.fieldValidationQueue("upcoming"),
                    linkLabel: "Open the Scheduled ahead queue",
                    icon: <CalendarDays aria-hidden="true" strokeWidth={1.75} />,
                  },
                  {
                    label: "Unscheduled",
                    count: unscheduled,
                    href: routes.fieldValidationQueue("needs_visit"),
                    linkLabel: "Open unscheduled validation work",
                  },
                ]
          }
        />
      </div>
      <div className="col-3">
        <KpiCard
          label="Unverified, no active work"
          value={String(summary.queues.unverified_no_active_work)}
          icon={<CircleHelp aria-hidden="true" strokeWidth={1.75} />}
          pointInTime
          href={routes.reportQueue("unverified_no_active_work")}
          linkLabel="Open the Unverified, no active work queue"
          emptyMessage={
            summary.queues.unverified_no_active_work === 0
              ? "No unverified report is without active work."
              : undefined
          }
        />
      </div>
    </div>
  );
}
