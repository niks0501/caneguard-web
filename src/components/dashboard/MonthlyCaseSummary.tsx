import type { MonthlyCaseSummary as MonthlyCaseSummaryData } from "../../domain/dashboard.types";

function metricValue(value: number | null, suffix = "") {
  return value === null ? "Not available" : `${value}${suffix}`;
}

export function MonthlyCaseSummary({
  summary,
  month,
  onMonthChange,
}: {
  summary: MonthlyCaseSummaryData;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  return (
    <section
      className="dashboard-monthly-summary"
      aria-labelledby="monthly-case-summary-heading"
    >
      <div className="dashboard-section-heading dashboard-monthly-summary__heading">
        <div>
          <h2 id="monthly-case-summary-heading">Monthly submitted report summary</h2>
        </div>
        <label className="select-filter dashboard-month-selector">
          <span>Summary month</span>
          <input
            type="month"
            value={month}
            aria-label="Summary month"
            onChange={(event) => {
              if (event.target.value) onMonthChange(event.target.value);
            }}
          />
        </label>
      </div>

      <p className="dashboard-monthly-summary__notice">
        Submitted reports and estimated affected area from submitted reports for {summary.month}.
        These are operational report counts, not population-level disease statistics.
      </p>

      <div className="dashboard-monthly-summary__metrics">
        <div className="monthly-summary-metric">
          <span>Submitted reports</span>
          <strong>{summary.reportedCases}</strong>
        </div>
        <div className="monthly-summary-metric">
          <span>Estimated affected area</span>
          <strong>{summary.estimatedAffectedHectares} ha</strong>
        </div>
        <div className="monthly-summary-metric">
          <span>Requiring field validation</span>
          <strong>{summary.fieldValidationCounts.requiringValidation}</strong>
        </div>
        <div className="monthly-summary-metric">
          <span>Closed submitted reports</span>
          <strong>{summary.closedCases}</strong>
        </div>
      </div>

      <p className="dashboard-monthly-summary__notice">
        Barangay and Possible Condition breakdowns now render as charts in the Report analytics section above,
        using PHT (UTC+8) period boundaries. This panel keeps its UTC calendar month.
      </p>

      <div className="dashboard-monthly-summary__grid">
        <section aria-labelledby="monthly-validation-heading" className="monthly-summary-card">
          <div className="monthly-summary-subheading">
            <h3 id="monthly-validation-heading">Field-validation counts</h3>
          </div>
          <dl className="monthly-summary-definition-list">
            <div><dt>No assignment</dt><dd>{summary.fieldValidationCounts.unassigned}</dd></div>
            <div><dt>Assigned</dt><dd>{summary.fieldValidationCounts.assigned}</dd></div>
            <div><dt>In progress</dt><dd>{summary.fieldValidationCounts.inProgress}</dd></div>
            <div><dt>Completed</dt><dd>{summary.fieldValidationCounts.completed}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="monthly-review-time-heading" className="monthly-summary-card">
          <div className="monthly-summary-subheading">
            <h3 id="monthly-review-time-heading">Review time</h3>
          </div>
          <dl className="monthly-summary-definition-list">
            <div>
              <dt>Submitted reports with supported timing</dt>
              <dd>{summary.reviewTime.reviewedCases}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{metricValue(summary.reviewTime.averageHours, " hours")}</dd>
            </div>
            <div>
              <dt>Median</dt>
              <dd>{metricValue(summary.reviewTime.medianHours, " hours")}</dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>
                {summary.reviewTime.minHours === null || summary.reviewTime.maxHours === null
                  ? "Not available"
                  : `${summary.reviewTime.minHours}-${summary.reviewTime.maxHours} hours`}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
