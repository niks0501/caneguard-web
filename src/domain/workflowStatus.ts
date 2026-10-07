import type { ReportLifecycle } from "./report.types";

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

export interface WorkflowStatusInput {
  lifecycle?: ReportLifecycle;
  firstReviewedAt?: string | null;
  scheduledRevisit?: boolean | null;
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
