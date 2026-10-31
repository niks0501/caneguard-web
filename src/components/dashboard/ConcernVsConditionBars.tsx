import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { DecisionChartFrame } from "./DecisionChartFrame";
import { VerificationLegend } from "./VerificationLegend";
import { dashboardChartCopy } from "./chartCopy";
import { bandColor, chartTheme } from "./chartTheme";
import { kpiBandForIndex, type KpiBand } from "./kpiBandEncoding";
import {
  POSSIBLE_CONDITIONS,
  reportedConcernLabel,
} from "./reportedConcern";
import { VERIFICATION_LEGEND } from "./verificationLegend";

interface ConcernRow {
  key: string;
  rowLabel: string;
  count: number;
  /** The `--kpi-band-<N>` slot this row paints, in ramp order. */
  band: KpiBand;
}

/**
 * C2 · Reported concern vs Possible Condition (overhaul §3.4, decision D4).
 * The standalone distribution is folded in here: the reported series sits
 * beside the AI series as paired horizontal bars with printed values, so
 * the comparison the reviewer needs is read directly instead of across two
 * charts. Vocabularies are never merged — every row is prefixed with its
 * vocabulary, RSSI appears only in the reported series, and the AI series
 * enumerates the deployed Model V1 four-class list.
 *
 * Every bar is one flat solid from the shared `--kpi-band-<N>` ramp, taken in
 * row order so each neighbouring pair clears 3:1 (the ramp alternates a
 * deepened light with a deep tone). Both vocabularies draw from the same ramp
 * and are told apart by their printed `Reported:` / `Possible:` row labels,
 * the white bar gaps and the card's accessible table — never by a texture. A
 * compact staff-verification strip closes the card as a real legend of solid
 * marks with printed counts, backed by the same three rows in the card's
 * accessible table.
 */
export function ConcernVsConditionBars({
  analytics,
  scopeLabel,
}: {
  analytics: ReportAnalytics;
  scopeLabel: string;
}) {
  const copy = dashboardChartCopy.concernVsCondition;
  const reportedRows: ConcernRow[] = analytics.reportedConcern.map((item, index) => ({
    key: `reported-${item.concern}`,
    rowLabel: `Reported: ${item.label}`,
    count: item.count,
    band: kpiBandForIndex(index),
  }));
  const offset = reportedRows.length;
  const aiRows: ConcernRow[] = POSSIBLE_CONDITIONS.map((entry, index) => {
    const count =
      analytics.possibleCondition.find((item) => item.condition === entry.value)
        ?.count ?? 0;
    return {
      key: `possible-${entry.value}`,
      rowLabel: `Possible: ${entry.label}`,
      count,
      band: kpiBandForIndex(offset + index),
    };
  });
  const rows = [...reportedRows, ...aiRows];
  const verification = analytics.verificationOutcome;
  const empty = analytics.totalSubmitted === 0;

  return (
    <DecisionChartFrame
      titleId="chart-concern-condition"
      title={copy.title}
      periodLine={`${scopeLabel} · submitted reports`}
      chartLabel={`${copy.title}: reported ${analytics.reportedConcern.map((item) => `${reportedConcernLabel(item.concern)} ${item.count}`).join(", ")}; possible condition ${POSSIBLE_CONDITIONS.map((entry) => `${entry.label} ${analytics.possibleCondition.find((item) => item.condition === entry.value)?.count ?? 0}`).join(", ")}`}
      empty={empty}
      emptyMessage="No submitted reports in this period."
      tableCaption={`${copy.title}. ${scopeLabel}`}
      tableHead={["Series", "Submitted reports"]}
      tableRows={rows.map((row) => [row.rowLabel, String(row.count)])}
      tableFootRows={VERIFICATION_LEGEND.map((entry) => [
        `Staff verification: ${entry.label}`,
        String(verification[entry.key]),
      ])}
      span="col-6"
    >
      <div className="decision-chart__canvas decision-chart__canvas--md">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.secondaryText }}
            />
            <YAxis
              type="category"
              dataKey="rowLabel"
              width="auto"
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.text }}
            />
            <Tooltip formatter={(value) => [value, "Submitted reports"]} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={bandColor(row.band)}
                  stroke={chartTheme.surface}
                  strokeWidth={1}
                />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                fill={chartTheme.text}
                fontSize={chartTheme.tickFontSize}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <VerificationLegend
        outcome={verification}
        label={copy.verificationStrip}
      />
    </DecisionChartFrame>
  );
}
