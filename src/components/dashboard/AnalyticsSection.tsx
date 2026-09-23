import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportAnalytics } from "../../domain/dashboard.types";
import { useAnalytics } from "../../hooks/useAnalytics";
import { manilaDateAt } from "../../domain/reportingTime";
import { ErrorState, LoadingState } from "../ui/States";
import {
  ANALYTICS_EMPTY_STATE,
  analyticsCopy,
  analyticsPeriodLine,
  areaDisclosureLine,
} from "./analyticsCopy";
import { barangayColor, chartTheme, conditionColor } from "./chartTheme";

function shiftDate(isoDate: string, days: number): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = manilaDateAt();
  return { from: shiftDate(to, -29), to };
}

function granularityFor(from: string, to: string): "day" | "week" {
  const days =
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    (24 * 60 * 60 * 1000) +
    1;
  return days <= 62 ? "day" : "week";
}

function formatTick(value: string): string {
  // Bucket labels are PHT calendar dates; week buckets are labelled by their
  // Monday. Keep axis ticks short without changing the underlying date.
  return value.length === 10 ? value.slice(5).replace("-", "/") : value;
}

function ChartFrame({
  titleId,
  title,
  description,
  periodLabel,
  chartLabel,
  empty,
  tableCaption,
  tableHead,
  tableRows,
  children,
}: {
  titleId: string;
  title: string;
  description: string;
  periodLabel: string;
  chartLabel: string;
  empty: boolean;
  tableCaption: string;
  tableHead: string[];
  tableRows: string[][];
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="analytics-card">
      <div className="monthly-summary-subheading">
        <h3 id={titleId}>{title}</h3>
      </div>
      <p className="analytics-card__description">{description}</p>
      <p className="analytics-card__period">{analyticsPeriodLine(periodLabel)}</p>
      {empty ? (
        <p className="monthly-summary-empty">{ANALYTICS_EMPTY_STATE}</p>
      ) : (
        <div role="img" aria-label={chartLabel} className="analytics-chart">
          {children}
        </div>
      )}
      <table className="sr-only">
        <caption>{tableCaption}</caption>
        <thead>
          <tr>
            {tableHead.map((head) => (
              <th key={head} scope="col">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function axisProps() {
  return {
    tick: { fill: chartTheme.secondaryText, fontSize: chartTheme.tickFontSize },
    tickLine: { stroke: chartTheme.border },
    axisLine: { stroke: chartTheme.border },
  };
}

export function AnalyticsSectionView({
  analytics,
  from,
  to,
  onFromChange,
  onToChange,
  onPreset,
}: {
  analytics: ReportAnalytics;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPreset: (preset: "week" | "month") => void;
}) {
  const { period } = analytics;
  const empty = analytics.totalSubmitted === 0;
  const seriesLabel =
    `Submitted reports over time, ${period.label}: ` +
    analytics.series.map((point) => `${point.label}: ${point.count}`).join(", ");
  const barangayLabel =
    `Submitted reports by barangay, ${period.label}: ` +
    analytics.casesByBarangay
      .map((item) => `${item.barangay}: ${item.reportedCases}`)
      .join(", ");
  const conditionLabel =
    `Submitted reports by Possible Condition, ${period.label}: ` +
    analytics.casesByPossibleCondition
      .map((item) => `${item.possibleCondition}: ${item.reportedCases}`)
      .join(", ");
  const caseStateLabel =
    `Open ${analytics.caseState.open} submitted reports, ` +
    `closed ${analytics.caseState.closed} submitted reports, ${period.label}.`;
  const delta = analytics.comparison.delta;
  const deltaCopy =
    delta === 0
      ? "No change on the previous comparable period."
      : delta > 0
        ? `Up ${delta} submitted reports on the previous comparable period.`
        : `Down ${Math.abs(delta)} submitted reports on the previous comparable period.`;
  const comparisonLabel =
    `Previous-period comparison, ${period.label}: ` +
    `${analytics.comparison.currentTotal} submitted reports this period, ` +
    `${analytics.comparison.previousTotal} in the previous period. ${deltaCopy}`;

  return (
    <section
      className="dashboard-analytics"
      aria-labelledby="report-analytics-heading"
    >
      <div className="dashboard-section-heading">
        <div>
          <h2 id="report-analytics-heading">Report analytics</h2>
          <p>
            Charts of submitted reports for any week, month or custom range.
            The monthly summary panel below uses the same Philippine calendar month.
          </p>
        </div>
      </div>

      <div className="analytics-period-control">
        <div role="group" aria-label="Period preset" className="analytics-presets">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onPreset("week")}
          >
            Past week
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onPreset("month")}
          >
            Past month
          </button>
        </div>
        <label className="select-filter">
          <span>From</span>
          <input
            type="date"
            aria-label="Analytics period start"
            value={from}
            max={to}
            onChange={(event) => {
              if (event.target.value) onFromChange(event.target.value);
            }}
          />
        </label>
        <label className="select-filter">
          <span>To</span>
          <input
            type="date"
            aria-label="Analytics period end"
            value={to}
            min={from}
            max={manilaDateAt()}
            onChange={(event) => {
              if (event.target.value) onToChange(event.target.value);
            }}
          />
        </label>
      </div>

      <p className="analytics-total" aria-live="polite">
        {analytics.totalSubmitted}{" "}
        {analytics.totalSubmitted === 1 ? "submitted report" : "submitted reports"}{" "}
        in this period.
      </p>

      <div className="dashboard-monthly-summary__grid">
        <ChartFrame
          titleId="analytics-series-heading"
          title={analyticsCopy.series.title}
          description={analyticsCopy.series.description}
          periodLabel={period.label}
          chartLabel={seriesLabel}
          empty={empty}
          tableCaption={`Submitted reports over time, ${period.label}`}
          tableHead={["Bucket", "Submitted reports"]}
          tableRows={analytics.series.map((point) => [
            point.label,
            String(point.count),
          ])}
        >
          <BarChart width={560} height={300} data={analytics.series}>
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickFormatter={formatTick} {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports" fill={chartTheme.brand} />
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-barangay-heading"
          title={analyticsCopy.barangay.title}
          description={analyticsCopy.barangay.description}
          periodLabel={period.label}
          chartLabel={barangayLabel}
          empty={empty}
          tableCaption={`Submitted reports by barangay, ${period.label}`}
          tableHead={["Barangay", "Submitted reports"]}
          tableRows={analytics.casesByBarangay.map((item) => [
            item.barangay,
            String(item.reportedCases),
          ])}
        >
          <BarChart
            width={560}
            height={Math.max(240, analytics.casesByBarangay.length * 48 + 80)}
            data={analytics.casesByBarangay.map((item) => ({
              name: item.barangay,
              count: item.reportedCases,
            }))}
            layout="vertical"
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} {...axisProps()} />
            <YAxis type="category" dataKey="name" width={120} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports">
              {analytics.casesByBarangay.map((item, index) => (
                <Cell key={item.barangay} fill={barangayColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-condition-heading"
          title={analyticsCopy.condition.title}
          description={`${analyticsCopy.condition.tag}. ${analyticsCopy.condition.description}`}
          periodLabel={period.label}
          chartLabel={conditionLabel}
          empty={empty}
          tableCaption={`Submitted reports by Possible Condition, ${period.label}`}
          tableHead={["Possible Condition", "Submitted reports"]}
          tableRows={analytics.casesByPossibleCondition.map((item) => [
            item.possibleCondition,
            String(item.reportedCases),
          ])}
        >
          <BarChart
            width={560}
            height={300}
            data={analytics.casesByPossibleCondition.map((item) => ({
              name: item.possibleCondition.replaceAll("_", " "),
              key: item.possibleCondition,
              count: item.reportedCases,
            }))}
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports">
              {analytics.casesByPossibleCondition.map((item) => (
                <Cell
                  key={item.possibleCondition}
                  fill={conditionColor(item.possibleCondition)}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-case-state-heading"
          title={analyticsCopy.caseState.title}
          description={analyticsCopy.caseState.description}
          periodLabel={period.label}
          chartLabel={caseStateLabel}
          empty={empty}
          tableCaption={`Open vs closed submitted reports, ${period.label}`}
          tableHead={["Register state", "Submitted reports"]}
          tableRows={[
            ["Open", String(analytics.caseState.open)],
            ["Closed", String(analytics.caseState.closed)],
          ]}
        >
          <BarChart
            width={560}
            height={300}
            data={[
              { name: "Open", count: analytics.caseState.open },
              { name: "Closed", count: analytics.caseState.closed },
            ]}
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports" fill={chartTheme.brand} />
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-comparison-heading"
          title={analyticsCopy.comparison.title}
          description={analyticsCopy.comparison.description}
          periodLabel={period.label}
          chartLabel={comparisonLabel}
          empty={empty}
          tableCaption={`Previous-period comparison, ${period.label}`}
          tableHead={["Period", "Submitted reports"]}
          tableRows={[
            [
              `${analytics.comparison.previousFrom} to ${analytics.comparison.previousTo}`,
              String(analytics.comparison.previousTotal),
            ],
            [
              `${period.from} to ${period.to}`,
              String(analytics.comparison.currentTotal),
            ],
          ]}
        >
          <BarChart
            width={560}
            height={300}
            data={[
              {
                name: "Previous",
                count: analytics.comparison.previousTotal,
              },
              { name: "Current", count: analytics.comparison.currentTotal },
            ]}
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports" fill={chartTheme.brand} />
          </BarChart>
          <p className="analytics-card__description">{deltaCopy}</p>
        </ChartFrame>

        <LifecycleCard analytics={analytics} empty={empty} />

        <ChartFrame
          titleId="analytics-area-heading"
          title={analyticsCopy.area.title}
          description={analyticsCopy.area.description}
          periodLabel={period.label}
          chartLabel={
            `Estimated affected area, ${period.label}: ` +
            `${analytics.area.measuredHectares} measured ha from ${analytics.area.measuredReports} submitted reports, ` +
            `${analytics.area.notMeasuredHectares} not-measured ha from ${analytics.area.notMeasuredReports} submitted reports.`
          }
          empty={empty}
          tableCaption={`Estimated affected area, ${period.label}`}
          tableHead={["Recorded as", "Estimated ha", "Submitted reports"]}
          tableRows={[
            ["Measured", String(analytics.area.measuredHectares), String(analytics.area.measuredReports)],
            ["Not measured", String(analytics.area.notMeasuredHectares), String(analytics.area.notMeasuredReports)],
          ]}
        >
          <BarChart
            width={560}
            height={300}
            data={[
              { name: "Measured", count: analytics.area.measuredHectares },
              { name: "Not measured", count: analytics.area.notMeasuredHectares },
            ]}
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Estimated ha" fill={chartTheme.brand} />
          </BarChart>
          <p className="analytics-card__description">{areaDisclosureLine(analytics.area)}</p>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-workload-heading"
          title={analyticsCopy.workload.title}
          description={analyticsCopy.workload.description}
          periodLabel={period.label}
          chartLabel={
            `Field-validation workload, ${period.label}: ` +
            [...analytics.validationWorkload.assignees.map(
              (item) => `${item.name}: ${item.openReports}`,
            ), `Unassigned: ${analytics.validationWorkload.unassigned}`].join(", ")
          }
          empty={empty}
          tableCaption={`Field-validation workload, ${period.label}`}
          tableHead={["Assignee", "Open validation reports"]}
          tableRows={[
            ...analytics.validationWorkload.assignees.map((item) => [
              item.name,
              String(item.openReports),
            ]),
            ["Unassigned", String(analytics.validationWorkload.unassigned)],
          ]}
        >
          <BarChart
            width={560}
            height={Math.max(
              240,
              (analytics.validationWorkload.assignees.length + 1) * 48 + 80,
            )}
            data={[
              ...analytics.validationWorkload.assignees.map((item) => ({
                name: item.name,
                count: item.openReports,
              })),
              { name: "Unassigned", count: analytics.validationWorkload.unassigned },
            ]}
            layout="vertical"
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} {...axisProps()} />
            <YAxis type="category" dataKey="name" width={140} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Open validation reports">
              {[
                ...analytics.validationWorkload.assignees.map((item) => ({
                  key: String(item.assigneeId),
                  name: item.name,
                })),
                { key: "unassigned", name: "Unassigned" },
              ].map((row, index) => (
                <Cell key={row.key} fill={barangayColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-schedule-heading"
          title={analyticsCopy.schedule.title}
          description={analyticsCopy.schedule.description}
          periodLabel={period.label}
          chartLabel={
            `Validation schedule against target dates, ${period.label}: ` +
            `unscheduled ${analytics.validationSchedule.unscheduled}, scheduled ${analytics.validationSchedule.scheduled}, ` +
            `due today ${analytics.validationSchedule.dueToday}, past target date ${analytics.validationSchedule.pastTargetDate}.`
          }
          empty={empty}
          tableCaption={`Validation schedule against target dates, ${period.label}`}
          tableHead={["Schedule bucket", "Open validation reports"]}
          tableRows={[
            ["Unscheduled", String(analytics.validationSchedule.unscheduled)],
            ["Scheduled", String(analytics.validationSchedule.scheduled)],
            ["Due today", String(analytics.validationSchedule.dueToday)],
            ["Past target date", String(analytics.validationSchedule.pastTargetDate)],
          ]}
        >
          <BarChart
            width={560}
            height={300}
            data={[
              { name: "Unscheduled", count: analytics.validationSchedule.unscheduled },
              { name: "Scheduled", count: analytics.validationSchedule.scheduled },
              { name: "Due today", count: analytics.validationSchedule.dueToday },
              { name: "Past target date", count: analytics.validationSchedule.pastTargetDate },
            ]}
          >
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Open validation reports" fill={chartTheme.brand} />
          </BarChart>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-backlog-heading"
          title={analyticsCopy.backlog.title}
          description={analyticsCopy.backlog.description}
          periodLabel={period.label}
          chartLabel={
            `Review backlog by waiting age, ${period.label}: ` +
            analytics.reviewBacklog.buckets.map((point) => `${point.label}: ${point.count}`).join(", ")
          }
          empty={empty}
          tableCaption={`Review backlog by waiting age, ${period.label}`}
          tableHead={["Waiting age", "Submitted reports"]}
          tableRows={analytics.reviewBacklog.buckets.map((point) => [
            point.label,
            String(point.count),
          ])}
        >
          <BarChart width={560} height={300} data={analytics.reviewBacklog.buckets}>
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickFormatter={formatTick} {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Submitted reports" fill={chartTheme.brand} />
          </BarChart>
          <p className="analytics-card__description">
            {analytics.reviewBacklog.totalWaiting === 0
              ? "No submitted reports waiting for a first review."
              : `${analytics.reviewBacklog.totalWaiting} submitted reports waiting for a first review` +
                (analytics.reviewBacklog.oldestWaitingDays === null
                  ? "."
                  : `; oldest wait ${analytics.reviewBacklog.oldestWaitingDays} days.`)}
          </p>
        </ChartFrame>

        <ChartFrame
          titleId="analytics-turnaround-heading"
          title={analyticsCopy.turnaround.title}
          description={analyticsCopy.turnaround.description}
          periodLabel={period.label}
          chartLabel={
            `Field-validation turnaround, ${period.label}: ` +
            `${analytics.validationTurnaround.completed} completed validations` +
            (analytics.validationTurnaround.averageHours === null
              ? "."
              : `, average ${analytics.validationTurnaround.averageHours} hours, median ${analytics.validationTurnaround.medianHours} hours.`)
          }
          empty={empty}
          tableCaption={`Field-validation turnaround, ${period.label}`}
          tableHead={["Duration", "Completed validations"]}
          tableRows={analytics.validationTurnaround.buckets.map((point) => [
            point.label,
            String(point.count),
          ])}
        >
          <BarChart width={560} height={300} data={analytics.validationTurnaround.buckets}>
            <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip />
            <Bar dataKey="count" name="Completed validations" fill={chartTheme.brand} />
          </BarChart>
          <p className="analytics-card__description">
            {analytics.validationTurnaround.completed === 0
              ? "No completed validations in this period."
              : `${analytics.validationTurnaround.completed} completed validations · ` +
                `average ${metricHours(analytics.validationTurnaround.averageHours)} · ` +
                `median ${metricHours(analytics.validationTurnaround.medianHours)} · ` +
                `range ${metricHours(analytics.validationTurnaround.minHours)}–${metricHours(analytics.validationTurnaround.maxHours)}.`}
          </p>
        </ChartFrame>
      </div>
    </section>
  );
}

function metricHours(value: number | null): string {
  return value === null ? "not available" : `${value} hours`;
}

function LifecycleCard({
  analytics,
  empty,
}: {
  analytics: ReportAnalytics;
  empty: boolean;
}) {
  const groups = [
    {
      key: "verification_outcome",
      title: analyticsCopy.lifecycle.verificationOutcome,
      entries: Object.entries(analytics.lifecycle.verificationOutcome),
    },
    {
      key: "field_validation_state",
      title: analyticsCopy.lifecycle.fieldValidationState,
      entries: Object.entries(analytics.lifecycle.fieldValidationState),
    },
    {
      key: "referral_state",
      title: analyticsCopy.lifecycle.referralState,
      entries: Object.entries(analytics.lifecycle.referralState),
    },
  ];

  return (
    <section aria-labelledby="analytics-lifecycle-heading" className="analytics-card">
      <div className="monthly-summary-subheading">
        <h3 id="analytics-lifecycle-heading">{analyticsCopy.lifecycle.title}</h3>
      </div>
      <p className="analytics-card__description">{analyticsCopy.lifecycle.description}</p>
      <p className="analytics-card__period">{analyticsPeriodLine(analytics.period.label)}</p>
      {empty ? (
        <p className="monthly-summary-empty">{ANALYTICS_EMPTY_STATE}</p>
      ) : (
        groups.map((group) => {
          const data = group.entries.map(([name, count]) => ({
            name: name.replaceAll("_", " "),
            count,
          }));
          const label =
            `${group.title}, ${analytics.period.label}: ` +
            group.entries.map(([name, count]) => `${name}: ${count}`).join(", ");
          return (
            <div key={group.key} className="analytics-lifecycle-group">
              <h4 className="analytics-lifecycle-group__title">{group.title}</h4>
              <div role="img" aria-label={label} className="analytics-chart">
                <BarChart width={560} height={220} data={data}>
                  <CartesianGrid stroke={chartTheme.border} strokeDasharray="3 3" />
                  <XAxis dataKey="name" {...axisProps()} />
                  <YAxis allowDecimals={false} {...axisProps()} />
                  <Tooltip />
                  <Bar dataKey="count" name="Submitted reports" fill={chartTheme.brand} />
                </BarChart>
              </div>
              <table className="sr-only">
                <caption>
                  {group.title}, {analytics.period.label}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">State</th>
                    <th scope="col">Submitted reports</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </section>
  );
}

export function AnalyticsSection() {
  const [range, setRange] = useState(defaultRange);
  const granularity = granularityFor(range.from, range.to);
  const query = useAnalytics({
    from: range.from,
    to: range.to,
    granularity,
  });

  const applyPreset = (preset: "week" | "month") => {
    const to = manilaDateAt();
    setRange({
      from: shiftDate(to, preset === "week" ? -6 : -29),
      to,
    });
  };

  if (query.isPending) {
    return (
      <section
        className="dashboard-analytics"
        aria-labelledby="report-analytics-heading"
      >
        <div className="dashboard-section-heading">
          <div>
            <h2 id="report-analytics-heading">Report analytics</h2>
          </div>
        </div>
        <LoadingState message="Loading report analytics..." />
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section
        className="dashboard-analytics"
        aria-labelledby="report-analytics-heading"
      >
        <div className="dashboard-section-heading">
          <div>
            <h2 id="report-analytics-heading">Report analytics</h2>
          </div>
        </div>
        <ErrorState
          message="Report analytics could not be loaded."
          onRetry={() => query.refetch()}
        />
      </section>
    );
  }

  return (
    <AnalyticsSectionView
      analytics={query.data}
      from={range.from}
      to={range.to}
      onFromChange={(from) => setRange((current) => ({ ...current, from }))}
      onToChange={(to) => setRange((current) => ({ ...current, to }))}
      onPreset={applyPreset}
    />
  );
}
