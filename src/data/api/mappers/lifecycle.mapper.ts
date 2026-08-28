import type {
  ReportLifecycle,
  ReviewStatus,
} from "../../../domain/report.types";
import type { ReportLifecycleDto } from "../schemas/report.schema";

const legacyLifecycleByStatus: Record<ReviewStatus, ReportLifecycle> = {
  submitted_unverified: {
    caseState: "open",
    verificationOutcome: "not_determined",
    fieldValidationState: "unassigned",
    referralState: "not_referred",
  },
  for_field_validation: {
    caseState: "open",
    verificationOutcome: "not_determined",
    fieldValidationState: "unassigned",
    referralState: "not_referred",
  },
  verified_by_staff: {
    caseState: "closed",
    verificationOutcome: "verified",
    fieldValidationState: "unassigned",
    referralState: "not_referred",
  },
  unable_to_verify: {
    caseState: "closed",
    verificationOutcome: "unable_to_verify",
    fieldValidationState: "unassigned",
    referralState: "not_referred",
  },
  resolved: {
    caseState: "closed",
    verificationOutcome: "not_determined",
    fieldValidationState: "unassigned",
    referralState: "not_referred",
  },
};

export function legacyLifecycleForReviewStatus(
  legacyStatus: ReviewStatus,
): ReportLifecycle {
  return legacyLifecycleByStatus[legacyStatus];
}

export function legacyReviewStatusForLifecycle(
  lifecycle: ReportLifecycle,
): ReviewStatus {
  if (lifecycle.caseState === "closed") {
    if (lifecycle.verificationOutcome === "verified") return "verified_by_staff";
    if (lifecycle.verificationOutcome === "unable_to_verify") return "unable_to_verify";
    return "resolved";
  }

  return lifecycle.fieldValidationState === "unassigned"
    ? "submitted_unverified"
    : "for_field_validation";
}

export function mapReportLifecycle(
  dto: ReportLifecycleDto | undefined,
  legacyStatus: ReviewStatus,
): ReportLifecycle {
  if (!dto) {
    return legacyLifecycleForReviewStatus(legacyStatus);
  }

  return {
    caseState: dto.case_state,
    verificationOutcome: dto.verification_outcome,
    fieldValidationState: dto.field_validation_state,
    referralState: dto.referral_state,
  };
}
