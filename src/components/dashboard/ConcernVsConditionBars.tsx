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
import { dashboardChartCopy } from "./chartCopy";
import { chartTheme, conditionColor, reportedConcernColor } from "./chartTheme";
import {
  patternIdFor,
  POSSIBLE_CONDITIONS,
  reportedConcernLabel,
} from "./reportedConcern";

interface ConcernRow {
  key: string;
  rowLabel: string;
  count: number;
  fill: string;
  pattern: string | null;
}

/**
 * C2 · Reported concern vs Possible Condition (overhaul §3.4, decision D4).
 * The standalone distribution is folded in here: the reported series sits
 * beside the AI series as paired horizontal bars with printed values, so
 * the comparison the reviewer needs is read directly instead of across two
 * charts. Vocabularies are never merged — every row is prefixed with its
 * vocabulary, RSSI appears only in the reported series, and the AI series
 * enumerates the shipped model's declared list. A compact
 * staff-verification strip closes the card.
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
    fill: reportedConcernColor(index),
    pattern: patternIdFor("reported", item.concern),
  }));
  const aiRows: ConcernRow[] = POSSIBLE_CONDITIONS.map((entry) => {
    const count =
      analytics.possibleCondition.find((item) => item.condition === entry.value)
        ?.count ?? 0;
    return {
      key: `possible-${entry.value}`,
      rowLabel: `Possible: ${entry.label}`,
      count,
      fill: conditionColor(entry.value),
      pattern: patternIdFor("possible", entry.value),
    };
  });
  const rows = [...reportedRows, ...aiRows];
  const verification = analytics.verificationOutcome;
  const empty = analytics.totalSubmitted === 0;

  return (
    <DecisionChartFrame
      titleId="chart-concern-condition"
      title={copy.title}
      hint={copy.hint}
      periodLine={scopeLabel}
      chartLabel={`${copy.title}: reported ${analytics.reportedConcern.map((item) => `${reportedConcernLabel(item.concern)} ${item.count}`).join(", ")}; possible condition ${POSSIBLE_CONDITIONS.map((entry) => `${entry.label} ${analytics.possibleCondition.find((item) => item.condition === entry.value)?.count ?? 0}`).join(", ")}`}
      empty={empty}
      emptyMessage="No submitted reports in this period."
      tableCaption={`${copy.title}. ${scopeLabel}`}
      tableHead={["Series", "Count"]}
      tableRows={rows.map((row) => [row.rowLabel, String(row.count)])}
      span="col-6"
    >
      <div className="decision-chart__canvas decision-chart__canvas--md">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
          >
            <defs>
              {rows.map((row) =>
                row.pattern ? (
                  <pattern
                    key={row.pattern}
                    id={row.pattern}
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform={
                      row.key.startsWith("possible-") ? "rotate(45)" : "rotate(-45)"
                    }
                  >
                    <rect width="6" height="6" fill={row.fill} />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      stroke={chartTheme.surface}
                      strokeWidth={2}
                    />
                  </pattern>
                ) : null,
              )}
            </defs>
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
            <Bar dataKey="count" isAnimationActive={false}>
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={row.pattern ? `url(#${row.pattern})` : row.fill}
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
      <ul className="decision-chart__strip" aria-label={copy.verificationStrip}>
        <li>
          <span>Verified by staff</span>
          <strong>{verification.verified}</strong>
        </li>
        <li>
          <span>Unable to verify</span>
          <strong>{verification.unable_to_verify}</strong>
        </li>
        <li>
          <span>Not yet determined</span>
          <strong>{verification.not_determined}</strong>
        </li>
      </ul>
    </DecisionChartFrame>
  );
}
