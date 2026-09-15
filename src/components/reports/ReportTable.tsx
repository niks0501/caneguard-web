import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import {
  authorityClassifiedConditionLabels,
  submitterRoleLabels,
} from "../../domain/report.metadata";
import type { DiseaseReport } from "../../domain/report.types";
import { formatAge, formatDate, formatDueState } from "../../lib/formatters";
import { EvidenceThumbnail } from "./EvidenceThumbnail";
import { DiseaseBadge, ReviewStatusBadge } from "./ReportBadges";

/**
 * The work queue renders operational priority: how old the submission is, when
 * the visit is due, the work status, and the staff classification. AI confidence
 * stays inside the case review's submitted-AI disclosure and is never a queue
 * priority score.
 */
export function ReportTable({ reports }: { reports: DiseaseReport[] }) {
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Possible Condition</th>
            <th scope="col">Reporter</th>
            <th scope="col">Barangay</th>
            <th scope="col">Submitted</th>
            <th scope="col">Follow-up</th>
            <th scope="col">Work status</th>
            <th scope="col"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const due = formatDueState(report.followUp);
            return (
            <tr
              className={`report-row report-row--${report.reviewStatus}${report.mismatchReported ? " report-row--mismatch" : ""}`}
              data-review-status={report.reviewStatus}
              key={report.uuid}
            >
              <td>
                <div className="report-identity">
                  <EvidenceThumbnail
                    status={report.imageStatus}
                    label={`Submitted evidence for ${report.referenceCode}`}
                    src={report.imageUrl}
                  />
                  <div>
                    <strong>{report.referenceCode}</strong>
                    <span>{report.farmReference ?? "No farm reference"}</span>
                    {report.mismatchReported === true ? (
                      <span className="mismatch-table-marker">AI mismatch flagged</span>
                    ) : null}
                  </div>
                </div>
              </td>
              <td>
                <DiseaseBadge disease={report.predictedDisease} />
                {report.authorityClassifiedCondition ? (
                  <span className="table-secondary">
                    Staff: {authorityClassifiedConditionLabels[report.authorityClassifiedCondition]}
                  </span>
                ) : null}
              </td>
              <td><strong className="table-primary">{report.submittedByName}</strong><span className="table-secondary">{submitterRoleLabels[report.submitterRole]}</span></td>
              <td>
                <strong className="table-primary">{report.barangay}</strong>
                <span className="table-secondary">
                  {report.locationUnavailable
                    ? "Location unavailable"
                    : [report.municipality, report.province].filter(Boolean).join(", ") || "Location not provided"}
                </span>
              </td>
              <td>
                <strong className="table-primary">{formatDate(report.submittedAt)}</strong>
                <span className="table-secondary">{formatAge(report.submittedAt)}</span>
              </td>
              <td>
                {due ? (
                  <>
                    <strong className={`table-primary${due.overdue ? " table-overdue" : ""}`}>
                      {due.label}
                    </strong>
                    <span className="table-secondary">
                      {due.overdue ? "Overdue" : "Visit scheduled"}
                    </span>
                  </>
                ) : (
                  <span className="table-secondary">No visit scheduled</span>
                )}
              </td>
              <td className="report-status-cell"><ReviewStatusBadge status={report.reviewStatus} /></td>
              <td>
                <Link className="table-action" to={routes.reportDetail(report.uuid)} aria-label={`Open ${report.referenceCode}`}>
                  <span>Open</span><ArrowUpRight aria-hidden="true" />
                </Link>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
