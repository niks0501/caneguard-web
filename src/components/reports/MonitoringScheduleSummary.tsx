import { CalendarDays } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { summarizeActiveWorkload } from "../../domain/monitoringSchedule";
import { manilaDateAt } from "../../domain/reportingTime";
import { useFieldValidationQueue } from "../../hooks/useFieldValidation";
import { activeVisitWorkloadFilters } from "./monitoringWorkload";

/**
 * Compact global active-work summary shown after the List case table.
 *
 * The counts come from the complete active visit workload, so List search,
 * Quick views, and manual filters never change them. The metrics are
 * informational; `Open Calendar` is the only schedule navigation action.
 */
export function MonitoringScheduleSummary() {
  const workload = useFieldValidationQueue(activeVisitWorkloadFilters, { complete: true });
  const counts = summarizeActiveWorkload(workload.data?.items ?? [], manilaDateAt());
  const unavailable = workload.isError && !workload.data;

  return (
    <section
      className="monitoring-schedule-summary"
      aria-labelledby="schedule-summary-heading"
    >
      <span className="monitoring-schedule-summary__scope">All active visits</span>
      <h2 id="schedule-summary-heading">Schedule summary</h2>
      <Link
        className="button button--secondary button--small monitoring-schedule-summary__action"
        to={`${routes.monitoring}?view=calendar`}
      >
        <CalendarDays aria-hidden="true" />
        <span>Open Calendar</span>
      </Link>
      {unavailable ? (
        <p className="monitoring-schedule-summary__alert" role="alert">
          Schedule summary unavailable. The register queue below is unaffected.
        </p>
      ) : workload.isPending && !workload.data ? (
        <p className="monitoring-schedule-summary__loading" role="status">
          Loading the global schedule summary…
        </p>
      ) : (
        <>
          {workload.isRefetchError && workload.data ? (
            <p className="monitoring-schedule-summary__alert" role="alert">
              The schedule summary could not be refreshed. Showing the last loaded counts.
            </p>
          ) : null}
          <dl className="monitoring-schedule-summary__metrics">
            <div className="monitoring-schedule-summary__metric">
              <dt>Overdue</dt>
              <dd>{counts.overdue}</dd>
            </div>
            <div className="monitoring-schedule-summary__metric">
              <dt>Today</dt>
              <dd>{counts.today}</dd>
            </div>
            <div className="monitoring-schedule-summary__metric">
              <dt>Next 7 days</dt>
              <dd>{counts.next7Days}</dd>
            </div>
            <div className="monitoring-schedule-summary__metric">
              <dt>Unscheduled</dt>
              <dd>{counts.unscheduled}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
