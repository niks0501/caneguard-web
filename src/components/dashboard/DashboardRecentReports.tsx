import { useNavigate } from "react-router";
import { routes } from "../../app/routes";
import type { DiseaseReport } from "../../domain/report.types";
import {
  QueueAffectedAreaCell,
  QueueCaseCell,
  QueueConditionCell,
  QueueLocationCell,
  QueueReviewLink,
  QueueStatusCell,
  type QueueRowView,
} from "../reports/QueueRowCells";

/**
 * The dashboard's latest-cases glance uses the same six-column reviewer queue
 * as every register, so a case reads identically wherever it appears. Rows stay
 * keyboard-openable and carry the displayed queue snapshot.
 */
const QUEUE_HEADERS = [
  "Case",
  "Location",
  "Possible Condition",
  "Affected Area",
  "Case Status",
  "Review",
] as const;

export function DashboardRecentReports({
  reports,
}: {
  reports: DiseaseReport[];
}) {
  const navigate = useNavigate();

  const queueState = (uuid: string) => ({
    reviewQueue: {
      remainingIds: reports
        .slice(reports.findIndex((report) => report.uuid === uuid) + 1)
        .map((report) => report.uuid),
      reviewedIds: [],
    },
  });

  const openCase = (uuid: string) => {
    navigate(routes.reportDetail(uuid), { state: queueState(uuid) });
  };

  return (
    <div className="table-scroll">
      <table className="report-table dashboard-report-table">
        <thead>
          <tr>
            {QUEUE_HEADERS.map((header) => (
              <th
                scope="col"
                key={header}
                className={
                  header === "Possible Condition"
                    ? "dashboard-report-table__cell-condition"
                    : header === "Case Status"
                      ? "dashboard-report-table__cell-status"
                      : undefined
                }
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const row: QueueRowView = report;
            return (
              <tr
                className={`report-row report-row--${report.reviewStatus}`}
                data-review-status={report.reviewStatus}
                key={report.uuid}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCase(report.uuid);
                  }
                }}
              >
                <td>
                  <QueueCaseCell row={row} />
                </td>
                <td>
                  <QueueLocationCell row={row} />
                </td>
                <td className="dashboard-report-table__cell-condition">
                  <QueueConditionCell row={row} />
                </td>
                <td>
                  <QueueAffectedAreaCell row={row} />
                </td>
                <td className="dashboard-report-table__cell-status">
                  <QueueStatusCell row={row} />
                </td>
                <td className="report-review-cell">
                  <QueueReviewLink row={row} state={queueState(report.uuid)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
