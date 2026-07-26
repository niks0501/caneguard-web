export type DiseaseKey = "healthy" | "mosaic" | "rust";

export type ReviewStatus =
  | "submitted_unverified"
  | "for_field_validation"
  | "verified_by_staff"
  | "unable_to_verify"
  | "resolved";

export type SubmitterRole = "field_reporter" | "reviewer" | "admin";

export type ImageStatus = "available" | "pending_sync" | "unavailable";

export interface SymptomResponse {
  id: string;
  label: string;
  answer: "yes" | "no" | "not_sure";
}

export interface DiseaseReport {
  uuid: string;
  referenceCode: string;
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
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest" | "confidence_desc" | "confidence_asc";
  page?: number;
  perPage?: number;
}

export interface PaginationMeta {
  currentPage: number;
  from: number | null;
  lastPage: number;
  perPage: number;
  to: number | null;
  total: number;
}

export interface PaginatedReports {
  reports: DiseaseReport[];
  meta: PaginationMeta;
}
