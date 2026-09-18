import type { MonthlyCaseSummary as MonthlyCaseSummaryData } from "../../domain/dashboard.types";

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function possibleConditionLabel(condition: string) {
  return `Possible Condition: ${condition.replaceAll("_", " ")}`;
}

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

      <div className="dashboard-monthly-summary__grid">
        <section aria-labelledby="monthly-barangay-heading" className="monthly-summary-card">
          <div className="monthly-summary-subheading">
            <h3 id="monthly-barangay-heading">Submitted reports by barangay</h3>
          </div>
          {summary.casesByBarangay.length === 0 ? (
            <p className="monthly-summary-empty">No submitted reports in this month.</p>
          ) : (
            <ul className="monthly-summary-list">
              {summary.casesByBarangay.map((item) => (
                <li key={item.barangay}>
                  <span>{item.barangay}</span>
                  <strong>{countLabel(item.reportedCases, "submitted report")}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="monthly-condition-heading" className="monthly-summary-card">
          <div className="monthly-summary-subheading">
            <h3 id="monthly-condition-heading">Submitted reports by Possible Condition</h3>
            <span className="summary-tag">Possible Condition, decision support only</span>
          </div>
          {summary.casesByPossibleCondition.length === 0 ? (
            <p className="monthly-summary-empty">No submitted reports in this month.</p>
          ) : (
            <ul className="monthly-summary-list">
              {summary.casesByPossibleCondition.map((item) => (
                <li key={item.possibleCondition}>
                  <span>{possibleConditionLabel(item.possibleCondition)}</span>
                  <strong>{countLabel(item.reportedCases, "submitted report")}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

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
