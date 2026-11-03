import type {
  ConditionTrend,
  ConditionTrendGroup,
  ReportAnalytics,
} from "../../domain/dashboard.types";
import { authorityClassifiedConditionLabels } from "../../domain/report.metadata";
import type { AuthorityClassifiedCondition } from "../../domain/report.types";
import { DecisionChartFrame } from "./DecisionChartFrame";
import { risingRuleLine, trendsCopy } from "./chartCopy";
import { reportCount } from "./countUnits";
import { POSSIBLE_CONDITIONS } from "./reportedConcern";

function staffLabel(condition: string): string {
  return authorityClassifiedConditionLabels[condition as AuthorityClassifiedCondition] ?? condition;
}

function aiLabel(condition: string): string {
  return POSSIBLE_CONDITIONS.find((entry) => entry.value === condition)?.label ?? condition;
}

function signed(delta: number): string {
  return delta === 0 ? "0" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

const BAR_VIEW_WIDTH = 100;
const BAR_VIEW_HEIGHT = 32;

/**
 * One flat-solid bar per bucket on a scale shared by the whole group, so the
 * multiples are comparable. Bars are `--kpi-band-1`; zero buckets keep a
 * hairline baseline so a quiet stretch still reads as a gap, not missing data.
 */
function BucketBars({ trend, max }: { trend: ConditionTrend; max: number }) {
  const count = trend.series.length;
  const slot = BAR_VIEW_WIDTH / Math.max(count, 1);
  return (
    <svg
      className="trend-multiple__bars"
      viewBox={`0 0 ${BAR_VIEW_WIDTH} ${BAR_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {trend.series.map((point, index) => {
        const height = max > 0 ? (point.count / max) * (BAR_VIEW_HEIGHT - 2) : 0;
        return point.count > 0 ? (
          <rect
            key={point.label}
            className="trend-multiple__bar"
            x={index * slot + slot * 0.12}
            width={slot * 0.76}
            y={BAR_VIEW_HEIGHT - height}
            height={height}
          />
        ) : null;
      })}
      <line
        className="trend-multiple__baseline"
        x1="0"
        x2={BAR_VIEW_WIDTH}
        y1={BAR_VIEW_HEIGHT - 0.5}
        y2={BAR_VIEW_HEIGHT - 0.5}
      />
    </svg>
  );
}

function ConditionTrendGrid({
  group,
  labelOf,
  title,
  empty,
  titleId,
  scopeLabel,
}: {
  group: ConditionTrendGroup;
  labelOf: (condition: string) => string;
  title: string;
  empty: string;
  titleId: string;
  scopeLabel: string;
}) {
  const entries = [
    ...group.conditions.map((trend) => ({ trend, label: labelOf(trend.condition) })),
    { trend: group.unclassified, label: trendsCopy.unclassified },
  ];
  const max = Math.max(0, ...entries.flatMap(({ trend }) => trend.series.map((point) => point.count)));
  const total = entries.reduce((sum, { trend }) => sum + trend.total, 0);
  const classified = total - group.unclassified.total;

  return (
    <DecisionChartFrame
      titleId={titleId}
      title={title}
      periodLine={scopeLabel}
      chartLabel={
        `${title}: ` +
        entries
          .map(
            ({ trend, label }) =>
              `${label} ${reportCount(trend.total)}${trend.rising ? ", rising" : ""}`,
          )
          .join("; ")
      }
      empty={classified === 0}
      emptyMessage={empty}
      tableCaption={`${title}. ${scopeLabel}`}
      tableHead={["Condition", "This period", "Previous period", "Rising"]}
      tableRows={entries.map(({ trend, label }) => [
        label,
        String(trend.total),
        String(trend.previousTotal),
        trend.rising ? "Rising" : "No",
      ])}
      span="col-12"
    >
      <ul className="trend-multiples">
        {entries.map(({ trend, label }) => (
          <li
            key={trend.condition}
            className="trend-multiple"
            data-condition={trend.condition}
            data-rising={trend.rising ? "true" : undefined}
          >
            <div className="trend-multiple__head">
              <span className="trend-multiple__label">{label}</span>
              {trend.rising ? (
                <span className="trend-flag">
                  <span aria-hidden="true">▲ </span>
                  {trendsCopy.rising}
                </span>
              ) : null}
            </div>
            <BucketBars trend={trend} max={max} />
            <div className="trend-multiple__foot">
              <span className="trend-multiple__value">{trend.total}</span>
              <span className="trend-multiple__prior">{`was ${trend.previousTotal}`}</span>
            </div>
          </li>
        ))}
      </ul>
    </DecisionChartFrame>
  );
}

/**
 * Condition and barangay trends. Staff classification leads, then the AI
 * Possible Condition, each as small multiples of one flat solid so no
 * five-colour ramp is needed; the barangay table carries this-vs-previous
 * deltas. "Rising" is decided by the API from named constants and printed
 * with text, never by fill alone.
 */
export function ConditionTrends({
  analytics,
  scopeLabel,
}: {
  analytics: ReportAnalytics;
  scopeLabel: string;
}) {
  const { seriesByCondition, seriesByBarangay, risingRule } = analytics;
  const rows = seriesByBarangay.rows;

  return (
    <section className="dashboard-section" aria-labelledby="condition-trends-heading">
      <div className="dashboard-section__heading">
        <h2 id="condition-trends-heading">{trendsCopy.heading}</h2>
        <p className="trend-rule">{risingRuleLine(risingRule)}</p>
      </div>
      <div className="dashboard-grid">
        <ConditionTrendGrid
          group={seriesByCondition.staffClassification}
          labelOf={staffLabel}
          title={trendsCopy.staff.title}
          empty={trendsCopy.staff.empty}
          titleId="trends-staff"
          scopeLabel={scopeLabel}
        />
        <ConditionTrendGrid
          group={seriesByCondition.possibleCondition}
          labelOf={aiLabel}
          title={trendsCopy.ai.title}
          empty={trendsCopy.ai.empty}
          titleId="trends-ai"
          scopeLabel={scopeLabel}
        />
        <div className="col-12">
          <section aria-labelledby="trends-barangays" className="decision-chart-card">
            <h3 id="trends-barangays" className="decision-chart-card__title">
              {`${trendsCopy.barangays.title} (${seriesByBarangay.topN})`}
            </h3>
            <p className="decision-chart-card__period">{scopeLabel}</p>
            {rows.length === 0 ? (
              <p className="decision-chart-card__empty">{trendsCopy.barangays.empty}</p>
            ) : (
              <div className="table-scroll">
                <table className="trend-table">
                  <thead>
                    <tr>
                      <th scope="col">Barangay</th>
                      <th scope="col">This period</th>
                      <th scope="col">Previous period</th>
                      <th scope="col">Change</th>
                      <th scope="col">
                        <span className="sr-only">Rising</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.barangay}>
                        <th scope="row">{row.barangay}</th>
                        <td>{row.total}</td>
                        <td>{row.previousTotal}</td>
                        <td>{signed(row.delta)}</td>
                        <td>
                          {row.rising ? (
                            <span className="trend-flag">
                              <span aria-hidden="true">▲ </span>
                              {trendsCopy.rising}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
