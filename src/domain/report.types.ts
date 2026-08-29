import type { OperationalQueue } from "./operationalQueue";

export type DiseaseKey = "healthy" | "mosaic" | "rust";

export type AuthorityClassifiedCondition =
  | "smut"
  | "downy_mildew"
  | "mixed_or_multiple"
  | "unable_to_classify";

export type LocationSource = "gps" | "manual_map";

export type ReviewStatus =
  | "submitted_unverified"
  | "for_field_validation"
  | "verified_by_staff"
  | "unable_to_verify"
  | "resolved";

export type CaseState = "open" | "closed";

export type VerificationOutcome =
  | "not_determined"
  | "verified"
  | "unable_to_verify";

export type FieldValidationState =
  | "unassigned"
  | "assigned"
  | "in_progress"
  | "completed";

export type ReferralState =
  | "not_referred"
  | "referred"
  | "expert_response_received";

export type ActionTaken =
  | "advisory_provided"
  | "technical_assistance_provided"
  | "referred_for_expert_validation"
  | "no_further_action_required";

export type PossibleMatchBasis =
  | "same_condition"
  | "nearby_location"
  | "recent_submission";

export type PossibleMatchAssessment =
  | "condition_and_location"
  | "location_unavailable";

export interface PossibleRecentMatch {
  uuid: string;
  referenceCode: string;
  submittedAt: string;
  condition: DiseaseKey;
  distanceMeters: number;
  basis: PossibleMatchBasis[];
  message: string;
}

export interface PossibleRecentMatches {
  matches: PossibleRecentMatch[];
  message: string;
  possibleMatch: boolean;
  canSubmit: boolean;
  assessment: PossibleMatchAssessment;
  recentWindowHours: number;
  locationRadiusMeters: number;
}

export interface CanonicalCaseLink {
  isDuplicate: boolean;
  canonicalCase: {
    uuid: string;
    referenceCode: string;
    submittedAt: string;
  } | null;
  linkedBy: { uuid: string; name: string } | null;
  linkedAt?: string;
  reason?: string;
}

export interface FieldValidationAssignment {
  uuid: string;
  assignee: { uuid: string; name: string };
  assignedBy: { uuid: string; name: string };
  targetVisitDate?: string;
  activatedAt: string;
  updatedAt: string;
}

export interface ReportLifecycle {
  caseState: CaseState;
  verificationOutcome: VerificationOutcome;
  fieldValidationState: FieldValidationState;
  referralState: ReferralState;
}

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
  farmerOrFarmOwnerName?: string;
  province?: string;
  municipality?: string;
  farmReference?: string;
  submittedByName: string;
  submitterUuid?: string;
  submitterRole: SubmitterRole;
  capturedAt: string;
  observedAt?: string;
  submittedAt: string;
  finalLatitude?: number;
  finalLongitude?: number;
  locationSource?: LocationSource;
  gpsAccuracy?: number;
  scanRecordClientUuid?: string;
  predictedDisease: DiseaseKey;
  confidence: number;
  imageUrl?: string;
  imageStatus: ImageStatus;
  imageMimeType?: string;
  imageSizeBytes?: number;
  imageSourceType?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  symptoms: SymptomResponse[];
  fieldNotes?: string;
  classScores?: Array<{ label: DiseaseKey; score: number }>;
  modelVersion?: string;
  processingTimingsMs?: {
    preprocess: number;
    inference: number;
    total: number;
  };
  checklistConsistency?: string;
  reportedSeverity?: string;
  qualityWarnings?: string[];
  sugarcaneVariety?: string;
  cropAge?: string;
  caneClass?: string;
  affectedAreaHectares?: number;
  affectedPortionPercent?: number;
  reviewStatus: ReviewStatus;
  mismatchReported?: boolean | null;
  reporterSuspectedCondition?: string | null;
  reporterObservationText?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  actionTaken?: ActionTaken | null;
  fieldValidationAssignment?: FieldValidationAssignment | null;
  lifecycle?: ReportLifecycle;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewVersion?: number;
  updatedAt?: string;
  metadataCorrectionAudits?: ReportAudit[];
  canonicalLinkage?: CanonicalCaseLink;
}

export interface ReportAudit {
  id: number;
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  actorName: string;
  createdAt: string;
  reason: string;
}

export interface ReportFilters {
  queue?: OperationalQueue;
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
