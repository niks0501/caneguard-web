import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
 * The work queue renders 6 scan columns at standard 1280px office laptop widths:
 * reference (which is the link), condition, location, submitted date, follow-up, and work status.
 * Additional details like reporter information are available behind row expansion.
 * AI confidence is never a queue priority score.
 */
export function ReportTable({ reports }: { reports: DiseaseReport[] }) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (uuid: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [uuid]: !prev[uuid],
    }));
  };

  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Possible Condition</th>
            <th scope="col">Location</th>
            <th scope="col">Submitted</th>
            <th scope="col">Follow-up</th>
            <th scope="col">Work status</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const due = formatDueState(report.followUp);
            const isExpanded = Boolean(expandedRows[report.uuid]);
            return (
              <tr
                className={`report-row report-row--${report.reviewStatus}${
                  report.mismatchReported ? " report-row--mismatch" : ""
                }`}
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
                      <Link
                        className="report-link"
                        to={routes.reportDetail(report.uuid)}
                        aria-label={`Open ${report.referenceCode}`}
                      >
                        <span className="sr-only">Open </span>
                        <strong>{report.referenceCode}</strong>
                      </Link>
                      <span>{report.farmReference ?? "No farm reference"}</span>
                      {report.mismatchReported === true ? (
                        <span className="mismatch-table-marker">
                          AI mismatch flagged
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <DiseaseBadge disease={report.predictedDisease} />
                  {report.authorityClassifiedCondition ? (
                    <span className="table-secondary">
                      Staff:{" "}
                      {
                        authorityClassifiedConditionLabels[
                          report.authorityClassifiedCondition
                        ]
                      }
                    </span>
                  ) : null}
                </td>
                <td>
                  <strong className="table-primary">{report.barangay}</strong>
                  <span className="table-secondary">
                    {report.locationUnavailable
                      ? "Location unavailable"
                      : [report.municipality, report.province]
                          .filter(Boolean)
                          .join(", ") || "Location not provided"}
                  </span>
                </td>
                <td>
                  <strong className="table-primary">
                    {formatDate(report.submittedAt)}
                  </strong>
                  <span className="table-secondary">
                    {formatAge(report.submittedAt)}
                  </span>
                </td>
                <td>
                  {due ? (
                    <>
                      <strong
                        className={`table-primary${
                          due.overdue ? " table-overdue" : ""
                        }`}
                      >
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
                <td className="report-status-cell">
                  <div className="report-status-cell__wrapper">
                    <ReviewStatusBadge status={report.reviewStatus} />
                    <button
                      type="button"
                      className="row-expand-btn"
                      aria-expanded={isExpanded}
                      aria-label={`Details for ${report.referenceCode}`}
                      onClick={() => toggleRow(report.uuid)}
                    >
                      {isExpanded ? (
                        <ChevronUp aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="report-row-expanded-content">
                      <div className="report-row-expanded-item">
                        <span className="table-secondary">Reporter: </span>
                        <strong className="table-primary">
                          {report.submittedByName}
                        </strong>{" "}
                        <span className="table-secondary">
                          ({submitterRoleLabels[report.submitterRole]})
                        </span>
                      </div>
                      {report.fieldValidationAssignment?.assignee ? (
                        <div className="report-row-expanded-item">
                          <span className="table-secondary">Assigned to: </span>
                          <strong className="table-primary">
                            {report.fieldValidationAssignment.assignee.name}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
