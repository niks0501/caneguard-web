import type { LatestValidationSummary, ReportLifecycle } from "./report.types";

/**
 * The one reviewer-facing workflow status. Every case surface renders exactly
 * one of these labels, derived on the client from the lifecycle dimensions
 * plus the first-reviewed signal and the explicit scheduled-revisit flag.
 *
 * Ratified precedence (section 7, Q7):
 * Resolved > Field Validation > Referred > Follow-Up > Under Review > Needs Review.
 */
export const workflowStatusValues = [
  "needs_review",
  "under_review",
  "field_validation",
  "referred",
  "follow_up",
  "resolved",
] as const;

export type WorkflowStatus = (typeof workflowStatusValues)[number];

export const workflowStatusLabels: Record<WorkflowStatus, string> = {
  needs_review: "Needs Review",
  under_review: "Under Review",
  field_validation: "Field Validation",
  referred: "Referred",
  follow_up: "Follow-Up",
  resolved: "Resolved",
};

/** Plain-words chip text for the same six values; filters keep the labels above. */
export const workflowStatusChipLabels: Record<WorkflowStatus, string> = {
  needs_review: "Waiting for your decision",
  under_review: "Being reviewed",
  field_validation: "Field visit assigned",
  referred: "Referred to expert",
  follow_up: "Follow-up planned",
  resolved: "Resolved",
};

export const workflowTrackSteps = [
  "Reported",
  "Reviewed",
  "Field check",
  "Resolved",
] as const;

/** Index of the furthest track step each status has reached. */
export const workflowTrackReached: Record<WorkflowStatus, number> = {
  needs_review: 0,
  under_review: 1,
  referred: 1,
  follow_up: 1,
  field_validation: 2,
  resolved: 3,
};

export interface WorkflowStatusInput {
  lifecycle?: ReportLifecycle;
  firstReviewedAt?: string | null;
  scheduledRevisit?: boolean | null;
  latestValidation?: LatestValidationSummary | null;
  fieldValidationCompleted?: boolean;
}

export function deriveWorkflowTrackReached(
  input: WorkflowStatusInput,
  status: WorkflowStatus = deriveWorkflowStatus(input),
): number {
  const statusMilestone = workflowTrackReached[status];

  return (
    input.fieldValidationCompleted ||
    input.lifecycle?.fieldValidationState === "completed" ||
    input.latestValidation
  )
    ? Math.max(statusMilestone, 2)
    : statusMilestone;
}

export function deriveWorkflowStatusChipLabel(
  input: WorkflowStatusInput,
  status: WorkflowStatus = deriveWorkflowStatus(input),
): string {
  if (status === "field_validation" && input.lifecycle?.fieldValidationState === "in_progress") {
    return "Field visit under way";
  }

  return workflowStatusChipLabels[status];
}

export function deriveWorkflowStatus(input: WorkflowStatusInput): WorkflowStatus {
  const lifecycle = input.lifecycle;

  if (lifecycle?.caseState === "closed") return "resolved";

  if (
    lifecycle?.fieldValidationState === "assigned" ||
    lifecycle?.fieldValidationState === "in_progress"
  ) {
    return "field_validation";
  }

  if (
    lifecycle?.referralState === "referred" ||
    lifecycle?.referralState === "expert_response_received"
  ) {
    return "referred";
  }

  // Follow-Up is flag-driven: a target visit date alone is not Follow-Up.
  if (input.scheduledRevisit === true) return "follow_up";

  if (input.firstReviewedAt) return "under_review";

  return "needs_review";
}
