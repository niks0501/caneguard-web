import { useLocation, useNavigate } from "react-router";
import { routes } from "../../app/routes";
import { parseReportListUrl } from "../../pages/reportListUrlState";
import type { DiseaseReport } from "../../domain/report.types";
import {
  QueueAffectedAreaCell,
  QueueCaseCell,
  QueueConditionCell,
  QueueLocationCell,
  QueueDisclaimer,
  QueueReviewLink,
  QueueStatusCell,
  type QueueRowView,
} from "./QueueRowCells";

/**
 * The one reviewer queue: exactly six columns that pick the next case.
 * Everything needed to review a case lives on the Case Review page, so the row
 * carries no expand surface, thumbnail, submitted timestamp or identity names.
 * The table rule: the table helps the reviewer decide which case to open next.
 */
const QUEUE_HEADERS = [
  "Case",
  "Location",
  "Possible Condition",
  "Affected Area",
  "Case Status",
  "Review",
] as const;

export function ReportTable({
  reports,
  variant = "default",
}: {
  reports: DiseaseReport[];
  variant?: "default" | "monitoring";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMonitoring = variant === "monitoring";

  const queueState = (uuid: string) => ({
    reviewQueue: {
      returnTo: `${location.pathname}${location.search}`,
      filters: parseReportListUrl(new URLSearchParams(location.search)).filters,
      remainingIds: reports
        .slice(reports.findIndex((report) => report.uuid === uuid) + 1)
        .map((report) => report.uuid),
      reviewedIds: [],
    },
  });

  const openCase = (uuid: string) => {
    navigate(routes.reportDetail(uuid), { state: queueState(uuid) });
  };

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    uuid: string,
  ) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("button, a, input, select, textarea, [role='button']")) {
      return;
    }
    openCase(uuid);
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    uuid: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCase(uuid);
    }
  };

  return (
    <>
    <div className="table-scroll">
      <table className={`report-table report-table--queue${isMonitoring ? " report-table--monitoring" : ""}`}>
        <thead>
          <tr>
            {QUEUE_HEADERS.map((header) => (
              <th scope="col" key={header}>{header}</th>
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
                onClick={(e) => handleRowClick(e, report.uuid)}
                onKeyDown={(e) => handleRowKeyDown(e, report.uuid)}
              >
                <td>
                  <QueueCaseCell row={row} />
                </td>
                <td>
                  <QueueLocationCell row={row} />
                </td>
                <td>
                  <QueueConditionCell row={row} />
                </td>
                <td>
                  <QueueAffectedAreaCell row={row} />
                </td>
                <td className="report-status-cell">
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
    <QueueDisclaimer />
    </>
  );
}
