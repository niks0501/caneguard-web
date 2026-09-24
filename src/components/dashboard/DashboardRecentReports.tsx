import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import type { DiseaseReport } from "../../domain/report.types";
import { formatDateTime } from "../../lib/formatters";
import { DiseaseBadge, ReviewStatusBadge } from "../reports/ReportBadges";
import { EvidenceThumbnail } from "../reports/EvidenceThumbnail";

/**
 * The table always fits its card: fixed tracks from `<colgroup>`, wrapping
 * cells, and no width floor above 100% — so a long barangay name or
 * reference code wraps inside its column instead of pushing the page. Below
 * 680px the tracks keep a readable floor and the card scrolls instead.
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
            <th scope="col">
              <span className="table-header-capsule">Possible Condition</span>
            </th>
            <th scope="col">Barangay</th>
            <th scope="col">Submitted</th>
            <th scope="col">
              <span className="table-header-capsule">Work status</span>
            </th>
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
              <td><DiseaseBadge disease={report.predictedDisease} includePossibleConditionPrefix={false} /></td>
              <td><strong className="table-primary">{report.barangay}</strong></td>
              <td>{formatDateTime(report.submittedAt)}</td>
              <td className="report-status-cell"><ReviewStatusBadge status={report.reviewStatus} /></td>
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
