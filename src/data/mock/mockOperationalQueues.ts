import type { OperationalQueue } from "../../domain/operationalQueue";
import type { DiseaseReport, ReportLifecycle } from "../../domain/report.types";
import { manilaDateAt } from "../../domain/reportingTime";
import { legacyLifecycleForReviewStatus } from "../api/mappers/lifecycle.mapper";

export function isCanonicalWorkReport(report: DiseaseReport): boolean {
  return report.canonicalLinkage?.isDuplicate !== true;
}

export function isInOperationalQueue(
  report: DiseaseReport,
  queue: OperationalQueue,
  today = manilaDateAt(),
): boolean {
  if (!isCanonicalWorkReport(report)) return false;

  const lifecycle: ReportLifecycle = report.lifecycle
    ?? legacyLifecycleForReviewStatus(report.reviewStatus);
  const { caseState, verificationOutcome, fieldValidationState, referralState } = lifecycle;
  const targetVisitDate = report.fieldValidationAssignment?.targetVisitDate;

  switch (queue) {
    case "needs_review":
      return caseState === "open"
        && verificationOutcome === "not_determined"
        && (report.actionTaken == null
          || (report.actionTaken === "referred_for_expert_validation"
            && (referralState === "referred" || referralState === "expert_response_received")))
        && (fieldValidationState === "completed"
          || (fieldValidationState === "unassigned"
            && report.reviewStatus !== "for_field_validation"));
    case "needs_visit":
      return caseState === "open"
        && fieldValidationState !== "completed"
        && (fieldValidationState === "assigned"
          || fieldValidationState === "in_progress"
          || (fieldValidationState === "unassigned"
            && report.reviewStatus === "for_field_validation"));
    case "follow_up_due":
      return caseState === "open"
        && fieldValidationState !== "completed"
        && Boolean(targetVisitDate && targetVisitDate < today);
    case "upcoming":
      return caseState === "open"
        && fieldValidationState !== "completed"
        && Boolean(targetVisitDate && targetVisitDate >= today);
    case "unverified_no_active_work":
      return caseState === "open"
        && verificationOutcome === "not_determined"
        && fieldValidationState === "unassigned"
        && referralState !== "referred"
        && referralState !== "expert_response_received"
        && report.actionTaken != null;
  }
}

export function filterMockOperationalQueue(
  reports: DiseaseReport[],
  queue: OperationalQueue,
  today = manilaDateAt(),
): DiseaseReport[] {
  return reports.filter((report) => isInOperationalQueue(report, queue, today));
}
