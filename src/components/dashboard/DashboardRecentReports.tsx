import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import type { DiseaseReport } from "../../domain/report.types";
import { formatDateTime } from "../../lib/formatters";
import { DiseaseBadge, ReviewStatusBadge } from "../reports/ReportBadges";
import { EvidenceThumbnail } from "../reports/EvidenceThumbnail";

export function DashboardRecentReports({
  reports,
}: {
  reports: DiseaseReport[];
}) {
  return (
    <div className="table-scroll">
      <table className="report-table dashboard-report-table">
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Possible result</th>
            <th scope="col">Barangay</th>
            <th scope="col">Submitted</th>
            <th scope="col">Review status</th>
            <th scope="col"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.uuid}>
              <td>
                <div className="report-identity">
                  <EvidenceThumbnail
                    status={report.imageStatus}
                    label={`Submitted evidence for ${report.referenceCode}`}
                  />
                  <div>
                    <strong>{report.referenceCode}</strong>
                    <span>Field report</span>
                  </div>
                </div>
              </td>
              <td><DiseaseBadge disease={report.predictedDisease} /></td>
              <td><strong className="table-primary">{report.barangay}</strong></td>
              <td>{formatDateTime(report.submittedAt)}</td>
              <td><ReviewStatusBadge status={report.reviewStatus} /></td>
              <td>
                <Link
                  className="table-action"
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
