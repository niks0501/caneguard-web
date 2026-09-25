import {
  CircleHelp,
  ClipboardCheck,
  ClipboardX,
  Rows3,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { routes } from "../../app/routes";
import type {
  DashboardSummary,
  ReportAnalytics,
} from "../../domain/dashboard.types";
import { KpiCard } from "./KpiCard";
import { RadialMeter } from "./RadialMeter";
import { SegmentedBar } from "./SegmentedBar";
import { Sparkline } from "./Sparkline";
import { StatusChip } from "./StatusChip";
import { formatWindow } from "./dashboardScope";
import type { MetricSegment } from "./metricSegments";

/**
 * Section A — Current operations (overhaul §3.2). Four compact KPI cards, one
 * per metric, each reduced to its header row, one large value, one compact
 * graphic drawn from data the page already loads (a submission sparkline, a
 * waiting-age radial, the field-validation schedule bar and an icon-led queue
 * chip) and its Open action. The two calendar subsets of the field-validation
 * queue (past target date and scheduled ahead) are encoded inside KPI 3's bar
 * only, never as peer cards or chip lists. Queue KPIs count current state, and
 * freshness is stamped once in the page header. Every graphic names its own
 * split, so the card never needs a text legend to stay accessible.
 */
export function OperationalSnapshot({
  summary,
  analytics,
  analyticsFailed,
}: {
  summary: DashboardSummary;
  analytics?: ReportAnalytics;
  analyticsFailed: boolean;
}) {
  const unscheduled = Math.max(
    0,
    summary.queues.needs_visit -
      summary.queues.follow_up_due -
      summary.queues.upcoming,
  );

  const waitingAge: MetricSegment[] =
    analytics && summary.queues.needs_review > 0
      ? analytics.reviewBacklog.buckets.map((bucket) => ({
          label: bucket.label,
          count: bucket.count,
        }))
      : [];

  const scheduleSplit: MetricSegment[] =
    summary.queues.needs_visit === 0
      ? []
      : [
          { label: "Past target date", count: summary.queues.follow_up_due },
          { label: "Scheduled ahead", count: summary.queues.upcoming },
          { label: "Unscheduled", count: unscheduled },
        ];

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
          href={routes.reportQueue("needs_review")}
          linkLabel="Open the Awaiting review queue"
        >
          {waitingAge.length > 0 ? (
            <RadialMeter label="Waiting age" segments={waitingAge} />
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
          href={routes.fieldValidationQueue("needs_visit")}
          linkLabel="Open the Needing field validation queue"
        >
          {scheduleSplit.length > 0 ? (
            <SegmentedBar
              label="Field-validation schedule"
              segments={scheduleSplit}
            />
          ) : null}
        </KpiCard>
      </div>
      <div className="col-3">
        <KpiCard
          label="Unverified, no active work"
          value={String(summary.queues.unverified_no_active_work)}
          icon={<CircleHelp aria-hidden="true" strokeWidth={1.75} />}
          href={routes.reportQueue("unverified_no_active_work")}
          linkLabel="Open the Unverified, no active work queue"
        >
          {summary.queues.unverified_no_active_work > 0 ? (
            <div className="kpi-chips">
              <StatusChip
                icon={<ClipboardX aria-hidden="true" strokeWidth={1.75} />}
                text="No field visit assigned"
                name="No field-validation visit is assigned to these reports"
              />
              <StatusChip
                icon={<ShieldAlert aria-hidden="true" strokeWidth={1.75} />}
                text="No expert referral active"
                name="No expert referral is active on these reports"
              />
            </div>
          ) : null}
        </KpiCard>
      </div>
    </div>
  );
}
