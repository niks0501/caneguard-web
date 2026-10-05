import type { MonthlyCaseSummary as MonthlyCaseSummaryData } from "../../domain/dashboard.types";

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
        Counts describe reports submitted during {summary.month}, not population-level disease statistics.
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
      </div>
    </section>
  );
}
