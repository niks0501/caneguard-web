import type {
  ActionTaken,
  ActiveAuthorityClassifiedCondition,
  AuthorityClassifiedCondition,
  CaseState,
  DiseaseKey,
  FieldValidationState,
  FollowUpOutcome,
  ImageStatus,
  LegacyAuthorityClassifiedCondition,
  MeasurementProvenance,
  ReviewStatus,
  SubmitterRole,
  VerificationOutcome,
} from "./report.types";

export const diseaseLabels: Record<DiseaseKey, string> = {
  healthy: "Possible Condition: No supported disease detected",
  mosaic: "Possible Condition: Mosaic",
  rust: "Possible Condition: Rust",
  smut: "Possible Condition: Smut",
};

/** Values offered when recording a new staff classification. */
export const activeAuthorityClassifiedConditions = [
  "healthy",
  "smut",
  "mosaic",
  "rust",
  "rssi",
  "mixed_or_multiple",
  "unable_to_classify",
] as const satisfies readonly ActiveAuthorityClassifiedCondition[];

/** Historical values that remain readable but are not new-review options. */
export const legacyAuthorityClassifiedConditions = [
  "downy_mildew",
] as const satisfies readonly LegacyAuthorityClassifiedCondition[];

export const activeAuthorityClassifiedConditionLabels: Record<
  ActiveAuthorityClassifiedCondition,
  string
> = {
  healthy: "Healthy / No Selected Concern",
  smut: "Sugarcane Smut",
  mosaic: "Sugarcane Mosaic Disease",
  rust: "Sugarcane Rust",
  rssi: "RSSI",
  mixed_or_multiple: "Mixed or Multiple Visible Concerns",
  unable_to_classify: "Unable to Classify",
};

export const legacyAuthorityClassifiedConditionLabels: Record<
  LegacyAuthorityClassifiedCondition,
  string
> = {
  downy_mildew: "Downy mildew",
};

export const authorityClassifiedConditionLabels: Record<
  AuthorityClassifiedCondition,
  string
> = {
  ...activeAuthorityClassifiedConditionLabels,
  ...legacyAuthorityClassifiedConditionLabels,
};

export function isLegacyAuthorityClassifiedCondition(
  value: AuthorityClassifiedCondition | null | undefined,
): value is LegacyAuthorityClassifiedCondition {
  return value !== null
    && value !== undefined
    && legacyAuthorityClassifiedConditions.includes(
      value as LegacyAuthorityClassifiedCondition,
    );
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  submitted_unverified: "Needs review",
  for_field_validation: "Needs field validation",
  verified_by_staff: "Verified by staff",
  unable_to_verify: "Unable to verify",
  resolved: "Resolved",
};

export const caseStateLabels: Record<CaseState, string> = {
  open: "Open",
  closed: "Closed",
};

export const verificationOutcomeLabels: Record<VerificationOutcome, string> = {
  not_determined: "Not determined",
  verified: "Verified",
  unable_to_verify: "Unable to verify",
};

export const fieldValidationStateLabels: Record<FieldValidationState, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
};

export const followUpOutcomeLabels: Record<FollowUpOutcome, string> = {
  improved: "Improved",
  unchanged: "Unchanged",
  worsened: "Worsened",
  unable_to_determine: "Unable to determine",
};

export const measurementProvenanceLabels: Record<
  MeasurementProvenance,
  string
> = {
  measured: "Measured",
  not_measured: "Not measured",
};

export const actionTakenLabels: Record<ActionTaken, string> = {
  advisory_provided: "Advisory provided",
  technical_assistance_provided: "Technical assistance provided",
  referred_for_expert_validation: "Referred for expert validation",
  no_further_action_required: "No further action required",
};

export const submitterRoleLabels: Record<SubmitterRole, string> = {
  field_reporter: "Field Inspector",
  reviewer: "Reviewer",
  admin: "Administrator",
};

export const imageStatusLabels: Record<ImageStatus, string> = {
  available: "Image available",
  pending_sync: "Image pending sync",
  unavailable: "Image unavailable",
};
