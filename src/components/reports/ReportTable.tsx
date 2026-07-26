import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { submitterRoleLabels } from "../../domain/report.metadata";
import type { DiseaseReport } from "../../domain/report.types";
import { formatDate } from "../../lib/formatters";
import { ConfidenceDisplay } from "./ConfidenceDisplay";
import { EvidenceThumbnail } from "./EvidenceThumbnail";
import { DiseaseBadge, ReviewStatusBadge } from "./ReportBadges";

export function ReportTable({ reports }: { reports: DiseaseReport[] }) {
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Possible result</th>
            <th scope="col">Reporter</th>
            <th scope="col">Barangay</th>
            <th scope="col">Captured</th>
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
                    src={report.imageUrl}
                  />
                  <div><strong>{report.referenceCode}</strong><span>{report.farmReference ?? "No farm reference"}</span></div>
                </div>
              </td>
              <td>
                <DiseaseBadge disease={report.predictedDisease} />
                <ConfidenceDisplay confidence={report.confidence} />
              </td>
              <td><strong className="table-primary">{report.submittedByName}</strong><span className="table-secondary">{submitterRoleLabels[report.submitterRole]}</span></td>
              <td><strong className="table-primary">{report.barangay}</strong><span className="table-secondary">Municipality</span></td>
              <td>{formatDate(report.capturedAt)}</td>
              <td>{formatDate(report.submittedAt)}</td>
              <td><ReviewStatusBadge status={report.reviewStatus} /></td>
              <td>
                <Link className="table-action" to={routes.reportDetail(report.uuid)} aria-label={`Open ${report.referenceCode}`}>
                  <span>Open</span><ArrowUpRight aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
