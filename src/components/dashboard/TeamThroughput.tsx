import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { useTheme } from "../../theme/useTheme";
import { DecisionChartFrame } from "./DecisionChartFrame";
import { bandColor, chartTheme, chartTooltipProps } from "./chartTheme";
import { throughputCopy } from "./chartCopy";
import type { KpiBand } from "./kpiBandEncoding";

const BAR_BAND: KpiBand = 1;
const HEADLINE_BAND: KpiBand = 2;

function axisTick(fill: string) {
  return { fontSize: chartTheme.tickFontSize, fill };
}

/** Hours as the unit a reader plans in: under two days in hours, else days. */
function formatDuration(hours: number | null): string {
  if (hours === null) return "not available";
  if (hours < 48) return `${Number(hours.toFixed(1))} hours`;
  return `${Number((hours / 24).toFixed(1))} days`;
}

function reviewTimeChange(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "No previous period to compare.";
  const difference = current - previous;
  if (Math.abs(difference) < 0.05) return "Same as the previous period.";
  return `${formatDuration(Math.abs(difference))} ${difference < 0 ? "shorter" : "longer"} than the previous period.`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Team throughput (Trends): the slim, retained slice of the former analytics
 * section. Review backlog aging is the current queue; the other three cards
 * follow the selected scope. The two time targets arrive from the API as
 * `targetDays`, so the page never restates them.
 */
export function TeamThroughput({
  analytics,
  scopeLabel,
}: {
  analytics: ReportAnalytics;
  scopeLabel: string;
}) {
  // Repaint on an appearance change: the Recharts fills below are literal
  // colours read from the token set, cached per theme.
  useTheme();
  const { reviewBacklog, validationWorkload, validationTurnaround, reviewTime } = analytics;
  const copy = throughputCopy;

  const workloadRows = [
    ...validationWorkload.assignees.map((item) => ({
      key: String(item.assigneeId),
      name: item.name,
      count: item.openReports,
    })),
    { key: "unassigned", name: "Unassigned", count: validationWorkload.unassigned },
  ];
  const workloadEmpty = workloadRows.every((row) => row.count === 0);

  const reviewCurrent = reviewTime.current;
  const reviewPrevious = reviewTime.previous;
  const reviewEmpty = reviewCurrent.reviewedCases === 0 && reviewPrevious.reviewedCases === 0;
  const reviewRows = [
    { name: "Previous period", hours: reviewPrevious.medianHours ?? 0, reviewed: reviewPrevious.reviewedCases },
    { name: "This period", hours: reviewCurrent.medianHours ?? 0, reviewed: reviewCurrent.reviewedCases },
  ];

  return (
    <section className="dashboard-section" aria-labelledby="team-throughput-heading">
      <div className="dashboard-section__heading">
        <h2 id="team-throughput-heading">{copy.heading}</h2>
      </div>
      <div className="dashboard-grid">
        <DecisionChartFrame
          titleId="throughput-review-time"
          title={copy.reviewTime.title}
          periodLine={scopeLabel}
          chartLabel={
            `${copy.reviewTime.title}: this period ${formatDuration(reviewCurrent.medianHours)} ` +
            `from ${plural(reviewCurrent.reviewedCases, "reviewed report")}; previous period ` +
            `${formatDuration(reviewPrevious.medianHours)} from ${plural(reviewPrevious.reviewedCases, "reviewed report")}.`
          }
          empty={reviewEmpty}
          emptyMessage={copy.reviewTime.empty}
          tableCaption={`${copy.reviewTime.title}. ${scopeLabel}`}
          tableHead={["Period", "Median hours", "Reviewed reports"]}
          tableRows={reviewRows.map((row, index) => [
            row.name,
            (index === 0 ? reviewPrevious.medianHours : reviewCurrent.medianHours) === null
              ? "not available"
              : String(row.hours),
            String(row.reviewed),
          ])}
          span="col-6"
        >
          <div className="decision-chart__canvas decision-chart__canvas--md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reviewRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={axisTick(chartTheme.text)} />
                <YAxis allowDecimals={false} tick={axisTick(chartTheme.secondaryText)} />
                <Tooltip {...chartTooltipProps()} />
                <Bar dataKey="hours" name="Median hours" fill={bandColor(HEADLINE_BAND)} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="decision-chart-card__hint">
            {`Median ${formatDuration(reviewCurrent.medianHours)} · ${reviewTimeChange(reviewCurrent.medianHours, reviewPrevious.medianHours)} `}
            {`Target: review within ${plural(reviewTime.targetDays, "day")} of submission.`}
          </p>
        </DecisionChartFrame>

        <DecisionChartFrame
          titleId="throughput-backlog"
          title={copy.backlog.title}
          periodLine={copy.backlog.scope}
          chartLabel={
            `${copy.backlog.title}: ` +
            reviewBacklog.buckets.map((point) => `${point.label}: ${point.count}`).join(", ")
          }
          empty={reviewBacklog.totalWaiting === 0}
          emptyMessage={copy.backlog.empty}
          tableCaption={`${copy.backlog.title}. ${copy.backlog.scope}`}
          tableHead={["Waiting age", "Submitted reports"]}
          tableRows={reviewBacklog.buckets.map((point) => [point.label, String(point.count)])}
          span="col-6"
        >
          <div className="decision-chart__canvas decision-chart__canvas--md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reviewBacklog.buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick(chartTheme.text)} />
                <YAxis allowDecimals={false} tick={axisTick(chartTheme.secondaryText)} />
                <Tooltip {...chartTooltipProps()} />
                <Bar dataKey="count" name="Submitted reports" fill={bandColor(BAR_BAND)} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="decision-chart-card__hint">
            {`${plural(reviewBacklog.totalWaiting, "submitted report")} waiting for a first review` +
              (reviewBacklog.oldestWaitingDays === null
                ? ". "
                : `; oldest wait ${plural(reviewBacklog.oldestWaitingDays, "day")}. `)}
            {`${reviewBacklog.pastTarget} past the ${plural(reviewBacklog.targetDays, "day")} review target.`}
          </p>
        </DecisionChartFrame>

        <DecisionChartFrame
          titleId="throughput-workload"
          title={copy.workload.title}
          periodLine={scopeLabel}
          chartLabel={
            `${copy.workload.title}: ` + workloadRows.map((row) => `${row.name}: ${row.count}`).join(", ")
          }
          empty={workloadEmpty}
          emptyMessage={copy.workload.empty}
          tableCaption={`${copy.workload.title}. ${scopeLabel}`}
          tableHead={["Assignee", "Open validation reports"]}
          tableRows={workloadRows.map((row) => [row.name, String(row.count)])}
          span="col-6"
        >
          <div className="decision-chart__canvas decision-chart__canvas--md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={workloadRows}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick(chartTheme.secondaryText)} />
                <YAxis type="category" dataKey="name" width="auto" tick={axisTick(chartTheme.text)} />
                <Tooltip {...chartTooltipProps()} />
                <Bar dataKey="count" name="Open validation reports" fill={bandColor(BAR_BAND)} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DecisionChartFrame>

        <DecisionChartFrame
          titleId="throughput-turnaround"
          title={copy.turnaround.title}
          periodLine={scopeLabel}
          chartLabel={
            `${copy.turnaround.title}: ${plural(validationTurnaround.completed, "completed validation")}` +
            (validationTurnaround.medianHours === null
              ? "."
              : `, median ${formatDuration(validationTurnaround.medianHours)}.`)
          }
          empty={validationTurnaround.completed === 0}
          emptyMessage={copy.turnaround.empty}
          tableCaption={`${copy.turnaround.title}. ${scopeLabel}`}
          tableHead={["Duration", "Completed validations"]}
          tableRows={validationTurnaround.buckets.map((point) => [point.label, String(point.count)])}
          span="col-6"
        >
          <div className="decision-chart__canvas decision-chart__canvas--md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={validationTurnaround.buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={axisTick(chartTheme.text)} />
                <YAxis allowDecimals={false} tick={axisTick(chartTheme.secondaryText)} />
                <Tooltip {...chartTooltipProps()} />
                <Bar dataKey="count" name="Completed validations" fill={bandColor(BAR_BAND)} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="decision-chart-card__hint">
            {`${validationTurnaround.withinTarget} of ${plural(validationTurnaround.completed, "completed validation")} ` +
              `visited within ${plural(validationTurnaround.targetDays, "day")} of assignment · ` +
              `median ${formatDuration(validationTurnaround.medianHours)}.`}
          </p>
        </DecisionChartFrame>
      </div>
    </section>
  );
}
