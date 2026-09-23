import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { routes } from "../../app/routes";
import {
  actionTakenLabels,
  authorityClassifiedConditionLabels,
  followUpOutcomeLabels,
  submitterRoleLabels,
} from "../../domain/report.metadata";
import type { DiseaseReport } from "../../domain/report.types";
import {
  formatAge,
  formatDate,
  formatDateTime,
  formatDueState,
} from "../../lib/formatters";
import { EvidenceThumbnail } from "./EvidenceThumbnail";
import {
  DiseaseBadge,
  IdentificationGapBadge,
  ReviewStatusBadge,
} from "./ReportBadges";

/**
 * The work queue renders 6 scan columns at standard 1280px office laptop widths:
 * reference (which is the link), condition, location, submitted date, follow-up, and work status.
 * Additional details like reporter information are available behind row expansion.
 * AI confidence is never a queue priority score.
 */
export function ReportTable({
  reports,
  variant = "default",
}: {
  reports: DiseaseReport[];
  variant?: "default" | "monitoring" | "expert" | "out-with-experts";
}) {
  const navigate = useNavigate();
  const isMonitoring = variant === "monitoring";
  const isOutWithExperts = variant === "out-with-experts";
  const isExpert = variant === "expert";
  const detailRoute = (uuid: string) => isExpert
    ? routes.expertReportDetail(uuid)
    : routes.reportDetail(uuid);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (uuid: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [uuid]: !prev[uuid],
    }));
  };

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    uuid: string,
  ) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest(
        "button, a, input, select, textarea, [role='button'], .report-row-expanded-content",
      )
    ) {
      return;
    }
    navigate(detailRoute(uuid));
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    uuid: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(detailRoute(uuid));
    }
  };

  return (
    <div className="table-scroll">
      <table className={`report-table${isMonitoring ? " report-table--monitoring" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Report</th>
            {isMonitoring ? (
              <>
                <th scope="col">Reported concern</th>
                <th scope="col">Latest validation</th>
                <th scope="col">Action taken</th>
                <th scope="col">Next follow-up</th>
              </>
            ) : isOutWithExperts ? (
              <>
                <th scope="col">Expert</th>
                <th scope="col">Referral date</th>
                <th scope="col">Due date</th>
                <th scope="col">Days out</th>
              </>
            ) : (
              <>
                <th scope="col">Possible Condition</th>
                <th scope="col">Location</th>
                <th scope="col">Submitted</th>
                <th scope="col">Follow-up</th>
              </>
            )}
            <th scope="col">Work status</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const due = formatDueState(report.followUp);
            const isExpanded = Boolean(expandedRows[report.uuid]);
            const expertName = report.expertConsult?.expertName
              ?? report.expertConsult?.expert?.name
              ?? (report.expertConsult?.status === "pending" ? "Unassigned" : "Unknown expert");
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
                  <div className="report-identity">
                    <EvidenceThumbnail
                      status={report.imageStatus}
                      label={`Submitted photo for ${report.referenceCode}`}
                      src={report.imageUrl}
                    />
                    <div>
                      <Link
                        className="report-link"
                        to={detailRoute(report.uuid)}
                        aria-label={`Open ${report.referenceCode}`}
                      >
                        <span className="sr-only">Open </span>
                        <strong>{report.referenceCode}</strong>
                      </Link>
                      <span>{isMonitoring
                        ? (report.farmReference ?? report.barangay)
                        : (report.farmReference ?? "No farm reference")}</span>
                      {isMonitoring ? (
                        <span className="table-secondary">Barangay: {report.barangay}</span>
                      ) : null}
                      {report.mismatchReported === true ? (
                        <span className="mismatch-table-marker">
                          Reporter concern needs review
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                {isMonitoring ? (
                  <>
                    <td className="monitoring-register-detail">
                      {report.reporterSuspectedCondition ? (
                        <strong className="table-primary">
                          Reported: {report.reporterSuspectedCondition}
                        </strong>
                      ) : (
                        <span className="table-secondary">No concern reported</span>
                      )}
                      {report.authorityClassifiedCondition ? (
                        <span className="table-secondary">
                          Staff: {authorityClassifiedConditionLabels[report.authorityClassifiedCondition]}
                        </span>
                      ) : (
                        <span className="table-secondary">Staff: Not classified</span>
                      )}
                    </td>
                    <td className="monitoring-register-detail">
                      {report.latestValidation ? (
                        <>
                          <strong className="table-primary">
                            {formatDateTime(report.latestValidation.visitedAt)}
                          </strong>
                          <span className="table-secondary">
                            {report.latestValidation.finding}
                          </span>
                          <span className="table-secondary">
                            {report.latestValidation.assignee?.name ?? "Assignee unavailable"}
                          </span>
                          {report.latestValidation.followUpOutcome ? (
                            <span className="monitoring-outcome-chip">
                              Follow-up: {followUpOutcomeLabels[report.latestValidation.followUpOutcome]}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="table-secondary">
                          {report.fieldValidationAssignment?.targetVisitDate
                            ? "Field visit assigned; report pending"
                            : "No visit completed"}
                        </span>
                      )}
                    </td>
                    <td className="monitoring-register-detail">
                      {report.actionTaken ? (
                        <span className="table-primary">
                          {actionTakenLabels[report.actionTaken] ?? report.actionTaken}
                        </span>
                      ) : (
                        <span className="table-secondary">Not recorded</span>
                      )}
                      {report.latestValidation?.actionTaken ? (
                        <span className="table-secondary">
                          Field: {report.latestValidation.actionTaken}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {due ? (
                        <>
                          <strong className={`table-primary${due.overdue ? " table-overdue" : ""}`}>
                            {due.label}
                          </strong>
                          <span className="table-secondary">
                            {due.overdue ? "Overdue" : "Scheduled"}
                          </span>
                        </>
                      ) : (
                        <span className="table-secondary">Not scheduled</span>
                      )}
                    </td>
                  </>
                ) : isOutWithExperts ? (
                  <>
                    <td>
                      <strong className="table-primary">{expertName}</strong>
                    </td>
                    <td>
                      <strong className="table-primary">{report.expertConsult?.referralDate ?? "Not set"}</strong>
                    </td>
                    <td>
                      <strong className={`table-primary${report.expertConsult?.overdue ? " table-overdue" : ""}`}>
                        {report.expertConsult?.dueDate ?? "No due date"}
                      </strong>
                      {report.expertConsult?.overdue ? <span className="table-secondary">Overdue</span> : null}
                    </td>
                    <td>
                      <strong className="table-primary">{report.expertConsult?.daysOut === null || report.expertConsult?.daysOut === undefined ? "Not available" : `${report.expertConsult.daysOut} ${report.expertConsult.daysOut === 1 ? "day" : "days"}`}</strong>
                    </td>
                  </>
                ) : (
                  <>
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
                  </>
                )}
                <td className="report-status-cell">
                  <div className="report-status-cell__wrapper">
                    <ReviewStatusBadge status={report.reviewStatus} />
                    <IdentificationGapBadge state={report.identificationGap?.state} />
                    {report.expertConsult ? (
                      <span className={`expert-consult-age${report.expertConsult.overdue ? " expert-consult-age--overdue" : ""}`}>
                        Waiting on expert: {report.expertConsult.ageLabel}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="row-expand-btn"
                      aria-expanded={isExpanded}
                      aria-label={`Details for ${report.referenceCode}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(report.uuid);
                      }}
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
                      <div className="report-row-expanded-item">
                        <span className="table-secondary">First reviewed: </span>
                        <strong className="table-primary">
                          {report.firstReviewedAt ? formatDate(report.firstReviewedAt) : "Not reviewed"}
                        </strong>
                      </div>
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
