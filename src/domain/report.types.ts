import type { OperationalQueue } from "./operationalQueue";

export type DiseaseKey = "healthy" | "mosaic" | "rust" | "smut";

/** Stable reporter-observation value sent by Mobile for the RSSI quick choice. */
export const REPORTER_OBSERVED_CONCERN_RSSI = "RSSI" as const;

export type ActiveAuthorityClassifiedCondition =
  | "healthy"
  | "smut"
  | "mosaic"
  | "rust"
  | "rssi"
  | "mixed_or_multiple"
  | "unable_to_classify";

export type LegacyAuthorityClassifiedCondition = "downy_mildew";

/**
 * All values readable from the API. Legacy values remain in this type so
 * historical reports can be displayed without being offered for new review.
 */
export type AuthorityClassifiedCondition =
  | ActiveAuthorityClassifiedCondition
  | LegacyAuthorityClassifiedCondition;

export type LocationSource = "gps" | "manual_map" | "unavailable";

/** D-01: whether a reported measurement was actually taken. */
export type MeasurementProvenance = "measured" | "not_measured";

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

export interface ReferralOfficeContext {
  caseState: CaseState;
  verificationOutcome: VerificationOutcome;
  fieldValidationState: FieldValidationState;
  actionTaken?: ActionTaken | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  notes?: string | null;
  reviewer?: { uuid: string; name: string } | null;
  reviewedAt?: string | null;
}

export interface ReportReferral {
  destination: string;
  reference: string;
  referralDate: string;
  note?: string | null;
  responseDate?: string | null;
  responseNote?: string | null;
  responseFinding?: string | null;
  referredBy?: { uuid: string; name: string } | null;
  responseRecordedBy?: { uuid: string; name: string } | null;
  responseRecordedAt?: string | null;
  officeContext: ReferralOfficeContext;
}

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

export interface FieldValidationCompletion {
  fieldObservation: string;
  fieldFinding: string;
  actionTaken: string;
}

export interface FieldValidationAssignment {
  uuid: string;
  assignee: { uuid: string; name: string };
  assignedBy: { uuid: string; name: string };
  targetVisitDate?: string;
  activatedAt: string;
  updatedAt: string;
  completion?: FieldValidationCompletion;
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
  /** Present in Case Review detail; intentionally absent from queue/list DTOs. */
  confidence?: number;
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
  affectedAreaMeasurement?: MeasurementProvenance;
  affectedPortionPercent?: number;
  affectedPortionMeasurement?: MeasurementProvenance;
  locationUnavailable?: boolean;
  locationUnavailableReason?: string | null;
  followUp?: { dueOn: string | null; overdue: boolean };
  reviewStatus: ReviewStatus;
  mismatchReported?: boolean | null;
  reporterSuspectedCondition?: string | null;
  reporterObservationText?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  actionTaken?: ActionTaken | null;
  fieldValidationAssignment?: FieldValidationAssignment | null;
  referral?: ReportReferral | null;
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

export type ReportSort = "newest" | "oldest" | "due_soonest";

export interface ReportFilters {
  queue?: OperationalQueue;
  search?: string;
  /** Derived compatibility projection; the actual lifecycle axes sit below. */
  status?: ReviewStatus | "all";
  caseState?: CaseState | "all";
  verificationOutcome?: VerificationOutcome | "all";
  fieldValidationState?: FieldValidationState | "all";
  staffClassifiedCondition?: AuthorityClassifiedCondition | "all";
  disease?: DiseaseKey | "all";
  barangay?: string | "all";
  dateFrom?: string;
  dateTo?: string;
  sort?: ReportSort;
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
