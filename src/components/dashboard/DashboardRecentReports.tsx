import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import type { DiseaseReport } from "../../domain/report.types";
import { formatDateTime } from "../../lib/formatters";
import { DiseaseBadge, ReviewStatusBadge } from "../reports/ReportBadges";
import { EvidenceThumbnail } from "../reports/EvidenceThumbnail";

/**
 * The table fits its card wherever it can: `<colgroup>` sets the preferred
 * tracks, long references and barangay names wrap inside their cell, and no
 * column carries a width floor above 100%. The two badge columns are the
 * exception — they size to their content (`min-width: max-content` plus a
 * no-wrap badge) so the longest real strings, "No supported disease detected"
 * and "Needs field validation", stay on one line. When the sum of those floors
 * outgrows the card, `.table-scroll` scrolls sideways instead of wrapping a
 * pill.
 */
export function DashboardRecentReports({
  reports,
}: {
  reports: DiseaseReport[];
}) {
  return (
    <div className="table-scroll">
      <table className="report-table dashboard-report-table">
        <colgroup>
          <col className="dashboard-report-table__col-report" />
          <col className="dashboard-report-table__col-concern" />
          <col className="dashboard-report-table__col-condition" />
          <col className="dashboard-report-table__col-barangay" />
          <col className="dashboard-report-table__col-submitted" />
          <col className="dashboard-report-table__col-status" />
          <col className="dashboard-report-table__col-action" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Reported concern</th>
            <th scope="col" className="dashboard-report-table__cell-condition">Possible Condition</th>
            <th scope="col">Barangay</th>
            <th scope="col">Submitted</th>
            <th scope="col" className="dashboard-report-table__cell-status">Work status</th>
            <th scope="col"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr
              className={`report-row report-row--${report.reviewStatus}`}
              data-review-status={report.reviewStatus}
              key={report.uuid}
            >
              <td>
                <div className="report-identity">
                  <EvidenceThumbnail
                    status={report.imageStatus}
                    label={`Submitted photo for ${report.referenceCode}`}
                    src={report.imageUrl}
                  />
                  <div className="report-identity__meta">
                    <strong>{report.referenceCode}</strong>
                  </div>
                </div>
              </td>
              <td>{report.reporterSuspectedCondition?.trim() ? report.reporterSuspectedCondition : "Not stated"}</td>
              <td className="dashboard-report-table__cell-condition"><DiseaseBadge disease={report.predictedDisease} includePossibleConditionPrefix={false} /></td>
              <td><strong className="table-primary">{report.barangay}</strong></td>
              <td>{formatDateTime(report.submittedAt)}</td>
              <td className="report-status-cell dashboard-report-table__cell-status"><ReviewStatusBadge status={report.reviewStatus} /></td>
              <td className="dashboard-report-table__action-cell">
                <Link
                  className="table-action table-action--nowrap"
                  to={routes.reportDetail(report.uuid)}
                  aria-label={`Open ${report.referenceCode}`}
                >
                  <span>Open</span>
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
