import type {
  DiseaseKey,
  ImageStatus,
  ReviewStatus,
  SubmitterRole,
} from "./report.types";

export const diseaseLabels: Record<DiseaseKey, string> = {
  healthy: "Healthy appearance",
  downy_mildew: "Possible downy mildew",
  smut: "Possible smut",
  mosaic: "Possible mosaic",
  rust: "Possible rust",
  unclear: "Unclear result",
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending_review: "Needs review",
  acknowledged: "Acknowledged",
  needs_field_verification: "Needs field verification",
  insufficient_evidence: "Insufficient evidence",
  closed: "Closed",
};

export const submitterRoleLabels: Record<SubmitterRole, string> = {
  farmer: "Farmer",
  field_inspector: "Field inspector",
  agricultural_personnel: "Agricultural personnel",
};

export const imageStatusLabels: Record<ImageStatus, string> = {
  available: "Image available",
  pending_sync: "Image pending sync",
  unavailable: "Image unavailable",
};
