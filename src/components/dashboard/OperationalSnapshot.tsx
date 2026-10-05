import { CircleSlash, ClipboardCheck, CircleHelp, Rows3, ShieldCheck } from "lucide-react";
import { routes } from "../../app/routes";
import type {
  DashboardSummary,
  ReportAnalytics,
} from "../../domain/dashboard.types";
import { KpiCard } from "./KpiCard";
import {
  COMPARISON_UNAVAILABLE,
  UNVERIFIED_SUPPORT_LINE,
  comparisonWindowTooltip,
  deltaSupportLine,
  noActiveWorkGraphicName,
  pastTargetDateSupportLine,
  waitingAgeSupportLine,
} from "./kpiSupport";
import { RadialMeter } from "./RadialMeter";
import { SegmentedBar } from "./SegmentedBar";
import { Sparkline } from "./Sparkline";
import { StatusIndicator } from "./StatusIndicator";
import { formatWindow } from "./dashboardScope";
import type { MetricSegment } from "./metricSegments";

/**
 * Section A — Current operations (overhaul §3.2). Four compact KPI cards, one
 * per metric, each composed as its header row, one large value, one supporting
 * line and one graphic: a submission sparkline, a waiting-age radial, the
 * field-validation schedule bar and a status indicator. The card itself links
 * to its queue, so no other text sits on the card. Every supporting figure is
 * read from the population and window the card already shows (`kpiSupport`):
 * KPI 1's delta from the same analytics request, KPI 2's oldest wait from the
 * same review backlog it counts, KPI 3's past-target count from the same
 * current-state queue. KPI 1 alone also carries the page's single tooltip,
 * defining what "previous period" means for the window the request returned
 * (the retired header scope note used to say it in prose). The two calendar
 * subsets of the field-validation queue
 * are encoded inside KPI 3's bar only, never as peer cards or chip lists, and
 * freshness is stamped once in the page header.
 */
export function OperationalSnapshot({
  summary,
  analytics,
  analyticsFailed,
  monthToDate,
}: {
  summary: DashboardSummary;
  analytics?: ReportAnalytics;
  analyticsFailed: boolean;
  /** True while the scoped window stops at today (month-to-date scope). */
  monthToDate: boolean;
}) {
  const unscheduled = Math.max(
    0,
    summary.queues.needs_visit -
      summary.queues.follow_up_due -
      summary.queues.upcoming,
  );

  // An empty backlog has no split to draw: the meter keeps its track and names
  // the empty split rather than printing zero-count slices.
  const waitingAge: MetricSegment[] | undefined = analytics
    ? analytics.reviewBacklog.totalWaiting > 0
      ? analytics.reviewBacklog.buckets.map((bucket) => ({
          label: bucket.label,
          count: bucket.count,
        }))
      : []
    : undefined;

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
          unavailable={!analytics}
          support={
            analytics
              ? deltaSupportLine(analytics.comparison.delta, monthToDate)
              : COMPARISON_UNAVAILABLE
          }
          supportTooltip={
            analytics
              ? comparisonWindowTooltip(
                  analytics.comparison.previousFrom,
                  analytics.comparison.previousTo,
                )
              : undefined
          }
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
          value={analytics ? String(analytics.reviewBacklog.totalWaiting) : "—"}
          unavailable={!analytics}
          support={waitingAgeSupportLine(analytics?.reviewBacklog)}
          icon={<ShieldCheck aria-hidden="true" strokeWidth={1.75} />}
          href={analytics
            ? `${routes.reportQueue("needs_review")}&date_from=${analytics.period.from}&date_to=${analytics.period.to}`
            : routes.reportQueue("needs_review")}
          linkLabel="Open the Awaiting review queue"
        >
          {waitingAge ? (
            <RadialMeter label="Waiting age" segments={waitingAge} />
          ) : null}
          {!analytics && !analyticsFailed ? (
            <div className="skeleton skeleton--ladder" aria-hidden="true" />
          ) : null}
        </KpiCard>
      </div>
      <div className="col-3">
        <KpiCard
          label="Needing field validation"
          value={String(summary.queues.needs_visit)}
          support={pastTargetDateSupportLine(summary.queues.follow_up_due)}
          icon={<ClipboardCheck aria-hidden="true" strokeWidth={1.75} />}
          href={routes.fieldValidationQueue("needs_visit")}
          linkLabel="Open the Needing field validation queue"
        >
          <SegmentedBar
            label="Field-validation schedule"
            segments={scheduleSplit}
          />
        </KpiCard>
      </div>
      <div className="col-3">
        <KpiCard
          label="Unverified, no active work"
          value={String(summary.queues.unverified_no_active_work)}
          support={UNVERIFIED_SUPPORT_LINE}
          icon={<CircleHelp aria-hidden="true" strokeWidth={1.75} />}
          href={routes.reportQueue("unverified_no_active_work")}
          linkLabel="Open the Unverified, no active work queue"
        >
          <StatusIndicator
            icon={<CircleSlash aria-hidden="true" strokeWidth={1.75} />}
            name={noActiveWorkGraphicName(
              summary.queues.unverified_no_active_work,
            )}
          />
        </KpiCard>
      </div>
    </div>
  );
}
