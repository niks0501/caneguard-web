import { useEffect, useState } from "react";
import { Link } from "react-router";
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
import { DecisionChartFrame } from "./DecisionChartFrame";
import { dashboardChartCopy } from "./chartCopy";
import { chartTheme } from "./chartTheme";

interface BarangayRow {
  barangay: string;
  submitted: number;
  open: number;
  pastTargetDate: number;
  scheduled: number;
  unscheduled: number;
}

/** Render the labelled count rows instead of the stack below ~680px. */
function useNarrowStack(): boolean {
  const query = "(max-width: 680px)";
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/**
 * C3 · Validation attention by barangay (overhaul §3.4, decision D3).
 * Submitted reports this period set the baseline bar; open validation work
 * splits into past target date / scheduled ahead / unscheduled segments
 * using the same queue predicates as KPI 3. The past-target segment is the
 * only non-brand workflow fill on the page and always carries its hatch
 * plus a printed value. Below ~680px the stack cannot carry labels, so a
 * labelled count-row list takes over (the sr-only table stays the single
 * accessible equivalent).
 */
export function BarangayValidationBars({
  analytics,
  scopeLabel,
}: {
  analytics: ReportAnalytics;
  scopeLabel: string;
}) {
  const copy = dashboardChartCopy.barangayValidation;
  const rows: BarangayRow[] = analytics.validationByBarangay.filter(
    (row) => row.submitted > 0 || row.open > 0,
  );
  const empty = rows.length === 0;
  const narrow = useNarrowStack();

  return (
    <DecisionChartFrame
      titleId="chart-barangay-validation"
      title={copy.title}
      hint={copy.hint}
      periodLine={scopeLabel}
      chartLabel={`${copy.title}: ${rows.map((row) => `${row.barangay} ${row.submitted} submitted, ${row.pastTargetDate} past target date`).join("; ")}`}
      empty={empty}
      emptyMessage="No submitted reports in this period."
      tableCaption={`${copy.title}. ${scopeLabel}`}
      tableHead={[
        "Barangay",
        "Submitted",
        "Past target date",
        "Scheduled ahead",
        "Unscheduled",
      ]}
      tableRows={rows.map((row) => [
        row.barangay,
        String(row.submitted),
        String(row.pastTargetDate),
        String(row.scheduled),
        String(row.unscheduled),
      ])}
      span="col-12"
    >
      {!empty && !narrow ? (
      <div className="decision-chart__canvas decision-chart__canvas--lg">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
            barCategoryGap="28%"
          >
            <defs>
              <pattern
                id="pattern-barangay-past"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill={chartTheme.danger} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={chartTheme.surface} strokeWidth={2} />
              </pattern>
              <pattern
                id="pattern-barangay-scheduled"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <rect width="6" height="6" fill={chartTheme.brandHover} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={chartTheme.surface} strokeWidth={2} />
              </pattern>
              <pattern
                id="pattern-barangay-unscheduled"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill={chartTheme.muted} />
                <circle cx="3" cy="3" r="1" fill={chartTheme.surface} />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.secondaryText }}
            />
            <YAxis
              type="category"
              dataKey="barangay"
              width="auto"
              tick={{ fontSize: chartTheme.tickFontSize, fill: chartTheme.text }}
            />
            <Tooltip
              formatter={(value, name) => [
                value,
                name === "submitted"
                  ? "Submitted this period"
                  : name === "past_target_date"
                    ? "Past target date"
                    : name === "scheduled"
                      ? "Scheduled ahead"
                      : "Unscheduled",
              ]}
            />
            <Bar
              dataKey="submitted"
              name="submitted"
              fill={chartTheme.primaryLight}
              fillOpacity={0.45}
              barSize={20}
              isAnimationActive={false}
            />
            <Bar
              dataKey="past_target_date"
              name="past_target_date"
              stackId="validation"
              fill="url(#pattern-barangay-past)"
              stroke={chartTheme.surface}
              strokeWidth={2}
              barSize={12}
              isAnimationActive={false}
            />
            <Bar
              dataKey="scheduled"
              name="scheduled"
              stackId="validation"
              fill="url(#pattern-barangay-scheduled)"
              stroke={chartTheme.surface}
              strokeWidth={2}
              barSize={12}
              isAnimationActive={false}
            />
            <Bar
              dataKey="unscheduled"
              name="unscheduled"
              stackId="validation"
              fill="url(#pattern-barangay-unscheduled)"
              stroke={chartTheme.surface}
              strokeWidth={2}
              barSize={12}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      ) : null}
      {!empty && narrow ? (
      <ul className="decision-chart__rows">
        {rows.map((row) => (
          <li key={row.barangay}>
            <Link to={`/reports?barangay=${encodeURIComponent(row.barangay)}`}>
              <strong>{row.barangay}</strong>
              <span>
                {row.submitted} submitted · {row.pastTargetDate} past target
                date · {row.scheduled} scheduled ahead · {row.unscheduled}{" "}
                unscheduled
              </span>
            </Link>
          </li>
        ))}
      </ul>
      ) : null}
      {!empty ? (
      <ul className="decision-chart__legend">
        <li>
          <span className="decision-chart__swatch decision-chart__swatch--baseline" aria-hidden="true" />
          Submitted this period
        </li>
        <li>
          <span className="decision-chart__swatch decision-chart__swatch--past" aria-hidden="true" />
          Past target date
        </li>
        <li>
          <span className="decision-chart__swatch decision-chart__swatch--scheduled" aria-hidden="true" />
          Scheduled ahead
        </li>
        <li>
          <span className="decision-chart__swatch decision-chart__swatch--unscheduled" aria-hidden="true" />
          Unscheduled
        </li>
      </ul>
      ) : null}
    </DecisionChartFrame>
  );
}
