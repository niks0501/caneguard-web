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
import { bandColor, chartTheme } from "./chartTheme";
import { kpiBandFillClass, type KpiBand } from "./kpiBandEncoding";

interface BarangayRow {
  barangay: string;
  submitted: number;
  open: number;
  pastTargetDate: number;
  scheduled: number;
  unscheduled: number;
}

/**
 * The four flat solids this card paints, in bar and legend order. Every entry
 * is one slot of the shared `--kpi-band-<N>` ramp, so the submitted baseline
 * and the three stacked open-work segments each clear 3:1 against the card
 * and against their neighbour.
 */
const BASELINE_BAND: KpiBand = 1;
const PAST_TARGET_BAND: KpiBand = 2;
const SCHEDULED_BAND: KpiBand = 3;
const UNSCHEDULED_BAND: KpiBand = 4;

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
 * using the same queue predicates as KPI 3. Each of the four marks is one
 * flat solid from the shared band ramp, and the past-target segment — the
 * attention one — keeps a printed value plus its legend entry, so the reading
 * never depends on fill colour alone. Below ~680px the stack cannot carry
 * labels, so a labelled count-row list takes over (the sr-only table stays
 * the single accessible equivalent).
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
      periodLine={scopeLabel}
      chartLabel={`${copy.title}: ${rows.map((row) => `${row.barangay} ${row.submitted} submitted, ${row.pastTargetDate} past target date`).join("; ")}`}
      empty={empty}
      emptyMessage="No submitted reports in this period."
      tableCaption={`${copy.title}. ${scopeLabel}`}
      tableHead={[
        "Barangay",
        "Submitted reports",
        "Reports past target date",
        "Reports scheduled ahead",
        "Unscheduled reports",
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
              fill={bandColor(BASELINE_BAND)}
              barSize={20}
              isAnimationActive={false}
            />
            <Bar
              dataKey="pastTargetDate"
              name="past_target_date"
              stackId="validation"
              fill={bandColor(PAST_TARGET_BAND)}
              stroke={chartTheme.surface}
              strokeWidth={2}
              barSize={12}
              isAnimationActive={false}
            />
            <Bar
              dataKey="scheduled"
              name="scheduled"
              stackId="validation"
              fill={bandColor(SCHEDULED_BAND)}
              stroke={chartTheme.surface}
              strokeWidth={2}
              barSize={12}
              isAnimationActive={false}
            />
            <Bar
              dataKey="unscheduled"
              name="unscheduled"
              stackId="validation"
              fill={bandColor(UNSCHEDULED_BAND)}
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
                {row.submitted} submitted reports · {row.pastTargetDate} reports past target
                date · {row.scheduled} reports scheduled ahead · {row.unscheduled}{" "}
                unscheduled reports
              </span>
            </Link>
          </li>
        ))}
      </ul>
      ) : null}
      {!empty ? (
      <ul className="decision-chart__legend">
        <li>
          <span
            className={`decision-chart__swatch decision-chart__swatch--baseline ${kpiBandFillClass(BASELINE_BAND)}`}
            data-series-band={BASELINE_BAND}
            aria-hidden="true"
          />
          Submitted reports this period
        </li>
        <li>
          <span
            className={`decision-chart__swatch decision-chart__swatch--past ${kpiBandFillClass(PAST_TARGET_BAND)}`}
            data-series-band={PAST_TARGET_BAND}
            aria-hidden="true"
          />
          Reports past target date
        </li>
        <li>
          <span
            className={`decision-chart__swatch decision-chart__swatch--scheduled ${kpiBandFillClass(SCHEDULED_BAND)}`}
            data-series-band={SCHEDULED_BAND}
            aria-hidden="true"
          />
          Reports scheduled ahead
        </li>
        <li>
          <span
            className={`decision-chart__swatch decision-chart__swatch--unscheduled ${kpiBandFillClass(UNSCHEDULED_BAND)}`}
            data-series-band={UNSCHEDULED_BAND}
            aria-hidden="true"
          />
          Unscheduled reports
        </li>
      </ul>
      ) : null}
    </DecisionChartFrame>
  );
}
