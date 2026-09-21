import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import { useMonthlyReportSummary } from "../../hooks/useReports";
import { ErrorState, LoadingState } from "../ui/States";

export interface ExpertVerificationPanelViewProps {
  month: string;
  data?: MonthlyReportSummary;
  isPending?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ExpertVerificationPanelView({
  month,
  data,
  isPending,
  isError,
  onRetry,
}: ExpertVerificationPanelViewProps) {
  const metrics = data?.expertVerification;
  const displayMonth = data?.month ?? month;
  const medianFindingDays = metrics?.timeToFinding?.medianHours == null
    ? null
    : metrics.timeToFinding.medianHours / 24;

  return (
    <section
      className="dashboard-monthly-summary dashboard-expert-verification"
      aria-labelledby="expert-verification-heading"
    >
      <div className="dashboard-section-heading dashboard-monthly-summary__heading">
        <div>
          <h2 id="expert-verification-heading">Expert verification</h2>
        </div>
      </div>

      {isPending ? (
        <div style={{ padding: "var(--space-4) var(--space-5)" }}>
          <LoadingState message="Loading expert verification numbers..." />
        </div>
      ) : isError ? (
        <div style={{ padding: "var(--space-4) var(--space-5)" }}>
          <ErrorState
            message="The monthly expert-verification numbers could not be loaded."
            onRetry={onRetry}
          />
        </div>
      ) : !metrics || metrics.consultVolume.total === 0 ? (
        <>
          <p className="dashboard-monthly-summary__notice">
            Monthly expert consult outcomes for {displayMonth}. Read-only operational summary from recorded expert evaluations.
          </p>
          <div className="monthly-summary-card">
            <p className="monthly-summary-empty" role="status">
              No expert verification consults recorded for this month.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="dashboard-monthly-summary__notice">
            Monthly expert consult outcomes for {displayMonth}. Read-only operational summary from recorded expert evaluations.
          </p>

          <div className="dashboard-monthly-summary__metrics">
            <div className="monthly-summary-metric">
              <span>Total consults</span>
              <strong>{metrics.consultVolume.total}</strong>
            </div>
            <div className="monthly-summary-metric">
              <span>Completed</span>
              <strong>{metrics.consultVolume.completed}</strong>
            </div>
            <div className="monthly-summary-metric">
              <span>Agreed with AI</span>
              <strong>{metrics.expertAgreement.count}</strong>
            </div>
            <div className="monthly-summary-metric">
              <span>Unable to classify</span>
              <strong>{metrics.unableToClassifyRate.count}</strong>
            </div>
            <div className="monthly-summary-metric">
              <span>Median days to finding</span>
              <strong>{medianFindingDays == null ? "Not available" : medianFindingDays.toFixed(1)}</strong>
            </div>
          </div>

          <div className="dashboard-monthly-summary__grid">
            <section
              aria-labelledby="expert-consult-status-heading"
              className="monthly-summary-card"
            >
              <div className="monthly-summary-subheading">
                <h3 id="expert-consult-status-heading">Consult status</h3>
              </div>
              <dl className="monthly-summary-definition-list">
                <div>
                  <dt>Completed</dt>
                  <dd>{metrics.consultVolume.completed}</dd>
                </div>
                <div>
                  <dt>In progress</dt>
                  <dd>{metrics.consultVolume.inProgress}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{metrics.consultVolume.pending}</dd>
                </div>
                <div>
                  <dt>Cancelled</dt>
                  <dd>{metrics.consultVolume.cancelled}</dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="expert-finding-outcomes-heading"
              className="monthly-summary-card"
            >
              <div className="monthly-summary-subheading">
                <h3 id="expert-finding-outcomes-heading">Finding outcomes</h3>
              </div>
              <dl className="monthly-summary-definition-list">
                <div>
                  <dt>Agreed with AI</dt>
                  <dd>{metrics.expertAgreement.count}</dd>
                </div>
                <div>
                  <dt>Unable to classify</dt>
                  <dd>{metrics.unableToClassifyRate.count}</dd>
                </div>
                <div>
                  <dt>Symptom disagreement</dt>
                  <dd>{metrics.symptomVerificationDisagreement.count}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

export function ExpertVerificationPanel({ month }: { month: string }) {
  const query = useMonthlyReportSummary(month);

  return (
    <ExpertVerificationPanelView
      month={month}
      data={query.data}
      isPending={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}
