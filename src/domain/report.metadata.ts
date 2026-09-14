import type {
  ActionTaken,
  AuthorityClassifiedCondition,
  DiseaseKey,
  ImageStatus,
  ReviewStatus,
  SubmitterRole,
} from "./report.types";

export const diseaseLabels: Record<DiseaseKey, string> = {
  healthy: "Possible healthy appearance",
  mosaic: "Possible mosaic",
  rust: "Possible rust",
  smut: "Possible smut",
};

export const authorityClassifiedConditionLabels: Record<
  AuthorityClassifiedCondition,
  string
> = {
  smut: "Smut",
  downy_mildew: "Downy mildew",
  mixed_or_multiple: "Mixed or multiple conditions",
  unable_to_classify: "Unable to classify",
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  submitted_unverified: "Needs review",
  for_field_validation: "Needs field validation",
  verified_by_staff: "Verified by staff",
  unable_to_verify: "Unable to verify",
  resolved: "Resolved",
};

export const actionTakenLabels: Record<ActionTaken, string> = {
  advisory_provided: "Advisory provided",
  technical_assistance_provided: "Technical assistance provided",
  referred_for_expert_validation: "Referred for expert validation",
  no_further_action_required: "No further action required",
};

export const submitterRoleLabels: Record<SubmitterRole, string> = {
  field_reporter: "Field reporter",
  reviewer: "Reviewer",
  admin: "Administrator",
};

export const imageStatusLabels: Record<ImageStatus, string> = {
  available: "Image available",
  pending_sync: "Image pending sync",
  unavailable: "Image unavailable",
};
