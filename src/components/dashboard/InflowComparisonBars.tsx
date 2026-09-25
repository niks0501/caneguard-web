import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ReportAnalytics,
  ReportAnalyticsSeriesPoint,
} from "../../domain/dashboard.types";
import { DecisionChartFrame } from "./DecisionChartFrame";
import { dashboardChartCopy } from "./chartCopy";
import { chartTheme } from "./chartTheme";
import { formatWindow } from "./dashboardScope";

function shortTick(value: string): string {
  return value.length === 10 ? value.slice(5).replace("-", "/") : value;
}

/**
 * C1 · Inflow: this period vs the same-length previous period (overhaul
 * §3.4, decision D2). Grouped bars per bucket; the previous window is
 * fetched with the same granularity and paired by relative bucket position. This period
 * is brand-only; the previous period carries a hatch so the comparison
 * never depends on colour alone.
 */
export function InflowComparisonBars({
  analytics,
  previousSeries,
  scopeLabel,
}: {
  analytics: ReportAnalytics;
  previousSeries?: ReportAnalyticsSeriesPoint[];
  scopeLabel: string;
}) {
  const copy = dashboardChartCopy.inflow;
  const rows = (analytics.comparison.currentSeries ?? analytics.series).map((point, index) => ({
    label: point.label,
    current: point.count,
    previous: previousSeries?.[index]?.count ?? null,
    previousLabel: previousSeries?.[index]?.label,
  }));
  const comparisonAvailable = previousSeries !== undefined &&
    rows.every((row) => row.previous !== null);
  const comparison = analytics.comparison;
  const periodLine = `${scopeLabel} vs ${formatWindow(comparison.previousFrom, comparison.previousTo)}`;
  const empty = analytics.totalSubmitted === 0 &&
    comparisonAvailable && comparison.previousTotal === 0;

  return (
    <DecisionChartFrame
      titleId="chart-inflow"
      title={copy.title}
      periodLine={periodLine}
      chartLabel={`${copy.title}: ${analytics.totalSubmitted} submitted this period; ${comparisonAvailable ? `${comparison.previousTotal} in the previous period` : "previous period unavailable"}`}
      empty={empty}
      emptyMessage="No submitted reports in this period."
      tableCaption={`${copy.title}. ${periodLine}`}
      tableHead={["Bucket", "This period", "Previous period"]}
      tableRows={rows.map((row) => [
        row.label,
        String(row.current),
        row.previous === null ? "Unavailable" : String(row.previous),
      ])}
      span="col-6"
    >
      <div className="decision-chart__canvas decision-chart__canvas--md">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <pattern
                id="pattern-inflow-previous"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill={chartTheme.primaryLight} />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke={chartTheme.surface}
                  strokeWidth={2}
                />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={shortTick}
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.secondaryText }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.secondaryText }}
            />
            <Tooltip
              formatter={(value, name) => [
                value,
                name === "current" ? "This period" : "Previous period",
              ]}
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as (typeof rows)[number] | undefined;
                return point?.previousLabel
                  ? `${point.label} vs ${point.previousLabel}`
                  : `Bucket ${point?.label ?? "unavailable"}`;
              }}
            />
            <Bar
              dataKey="current"
              name="This period"
              fill={chartTheme.primaryDark}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            {comparisonAvailable ? <Bar
              dataKey="previous"
              name="Previous period"
              fill="url(#pattern-inflow-previous)"
              stroke={chartTheme.brandHover}
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            /> : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="decision-chart__legend">
        <li>
          <span className="decision-chart__swatch decision-chart__swatch--current" aria-hidden="true" />
          This period ({analytics.totalSubmitted})
        </li>
        <li>
          {comparisonAvailable ? <span className="decision-chart__swatch decision-chart__swatch--previous" aria-hidden="true" /> : null}
          {comparisonAvailable ? `Previous period (${comparison.previousTotal})` : "Previous period unavailable"}
        </li>
      </ul>
    </DecisionChartFrame>
  );
}
