export type DiseaseKey =
  | "healthy"
  | "downy_mildew"
  | "smut"
  | "mosaic"
  | "rust"
  | "unclear";

export type ReviewStatus =
  | "pending_review"
  | "acknowledged"
  | "needs_field_verification"
  | "insufficient_evidence"
  | "closed";

export type SubmitterRole =
  | "farmer"
  | "field_inspector"
  | "agricultural_personnel";

export type ImageStatus = "available" | "pending_sync" | "unavailable";

export interface SymptomResponse {
  id: string;
  label: string;
  answer: "yes" | "no" | "not_sure";
}

export interface DiseaseReport {
  id: string;
  barangay: string;
  farmReference?: string;
  submittedByName: string;
  submitterRole: SubmitterRole;
  capturedAt: string;
  submittedAt: string;
  predictedDisease: DiseaseKey;
  confidence: number;
  imageUrl?: string;
  imageStatus: ImageStatus;
  symptoms: SymptomResponse[];
  fieldNotes?: string;
  reviewStatus: ReviewStatus;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ReportFilters {
  search?: string;
  status?: ReviewStatus | "all";
  disease?: DiseaseKey | "all";
  barangay?: string | "all";
}
