import type { OperationalQueue } from "./operationalQueue";
import type { WorkflowStatus } from "./workflowStatus";

export type DiseaseKey = "healthy" | "mosaic" | "rust" | "smut";
export type AttentionBand = "green" | "amber" | "red";

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

export type LocationUnavailableReason =
  | "permission_denied"
  | "services_unavailable"
  | "low_accuracy"
  | "offline_no_map"
  | "other";

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

export type FollowUpOutcome =
  | "improved"
  | "unchanged"
  | "worsened"
  | "unable_to_determine";

export type ReferralState =
  | "not_referred"
  | "referred"
  | "expert_response_received";

export type ConsultStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export type FindingSource = "in_system" | "transcribed";
export type ConsultReviewOutcome = "accepted" | "overridden";
export type IdentificationGapState = "identified" | "provisional" | "unidentified";

export interface IdentificationGap {
  state: IdentificationGapState;
  reasons: string[];
}

export type ActionTaken =
  | "advisory_provided"
  | "technical_assistance_provided"
  | "referred_for_expert_validation"
  | "no_further_action_required";

export type AdvisoryStatus = "draft" | "validated" | "retired";
export type AdvisoryDeliveryState =
  | "not_selected"
  | "pending"
  | "delivered"
  | "acknowledged";

export interface Advisory {
  uuid: string;
  code: string;
  title: string;
  content: string;
  status: AdvisoryStatus;
  validationProvenance?: string | null;
  validatedAt?: string | null;
}

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
  id?: number;
  status?: ConsultStatus;
  destination: string;
  reference: string | null;
  trackingCode?: string | null;
  referralDate: string;
  dueDate?: string | null;
  expertName?: string | null;
  expertContact?: string | null;
  shareFullContext?: boolean;
  inviteIssuedAt?: string | null;
  inviteExpiresAt?: string | null;
  inviteRevokedAt?: string | null;
  inviteAccessCount?: number;
  inviteFirstAccessedAt?: string | null;
  inviteLastAccessedAt?: string | null;
  note?: string | null;
  responseDate?: string | null;
  responseNote?: string | null;
  responseFinding?: string | null;
  findingSummary?: string | null;
  conditionOpinion?: AuthorityClassifiedCondition | null;
  symptomVerdicts?: Record<string, { verdict: "present" | "absent" | "unsure"; note?: string | null }> | null;
  findingDetails?: string | null;
  findingConfidence?: "low" | "medium" | "high" | null;
  findingRecommendation?: string | null;
  findingSource?: FindingSource | null;
  findingRecordedBy?: { uuid: string; name: string } | null;
  findingRecordedAt?: string | null;
  referredBy?: { uuid: string; name: string } | null;
  responseRecordedBy?: { uuid: string; name: string } | null;
  responseRecordedAt?: string | null;
  consultReviewOutcome?: ConsultReviewOutcome | null;
  consultReviewNote?: string | null;
  consultReviewedBy?: { uuid: string; name: string } | null;
  consultReviewedAt?: string | null;
  officeContext: ReferralOfficeContext;
}

export interface ReportConsult {
  note?: string | null;
  id: number;
  status?: ConsultStatus;
  destination: string;
  reference: string | null;
  trackingCode?: string | null;
  referralDate: string;
  dueDate?: string | null;
  expertName?: string | null;
  expertContact?: string | null;
  shareFullContext?: boolean;
  inviteIssuedAt?: string | null;
  inviteExpiresAt?: string | null;
  inviteRevokedAt?: string | null;
  inviteAccessCount?: number;
  inviteFirstAccessedAt?: string | null;
  inviteLastAccessedAt?: string | null;
  findingSummary?: string | null;
  conditionOpinion?: AuthorityClassifiedCondition | null;
  symptomVerdicts?: Record<string, { verdict: "present" | "absent" | "unsure"; note?: string | null }> | null;
  findingDetails?: string | null;
  findingConfidence?: "low" | "medium" | "high" | null;
  findingRecommendation?: string | null;
  findingSource?: FindingSource | null;
  responseDate?: string | null;
  consultReviewOutcome?: ConsultReviewOutcome | null;
  consultReviewNote?: string | null;
  consultReviewedBy?: { uuid: string; name: string } | null;
  consultReviewedAt?: string | null;
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
  followUpOutcome?: FollowUpOutcome | null;
  visitedAt?: string;
  freshPhoto?: {
    available: boolean;
    url?: string | null;
  };
}

export interface LatestValidationSummary {
  visitedAt: string;
  fieldObservation: string;
  finding: string;
  actionTaken: string;
  followUpOutcome?: FollowUpOutcome | null;
  assignee?: { uuid: string; name: string } | null;
  freshPhoto?: {
    available: boolean;
    url?: string | null;
  };
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

export interface ReportMachineFacts {
  confidence?: number | null;
  checklistConsistency?: string | null;
  qualityWarnings: string[];
  gpsAccuracy?: number | null;
  locationSource?: LocationSource | null;
  reporterConcern?: string | null;
  reporterMismatch?: boolean | null;
}

export type CaseHistoryEntryType = "review" | "field_validation" | "referral" | "correction";

export interface ReportCaseHistoryEntry {
  id: string;
  type: CaseHistoryEntryType;
  typeLabel: string;
  timestamp: string;
  actor: string;
  fields: Array<{ label: string; value: string | null }>;
  notes?: string | null;
}

export interface ReportCaseHistory {
  entries: ReportCaseHistoryEntry[];
  available: boolean;
  sources: {
    reviewEvents: boolean;
    corrections: boolean;
    assignments: boolean;
    consults: boolean;
  };
}

export interface HandoffNote {
  id: number;
  destination: string;
  reference: string | null;
  sent_date: string;
  note: string | null;
  advice_received_note: string | null;
}

export interface DiseaseReport {
  handoffNotes?: HandoffNote[];
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
  firstReviewedAt?: string;
  /** Ratified explicit scheduled-revisit flag driving the Follow-Up state. */
  scheduledRevisit?: boolean;
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
  classScores?: Array<{ label: string; score: number }>;
  modelVersion?: string;
  modelVersionRecognised?: boolean;
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
  latestValidation?: LatestValidationSummary | null;
  referral?: ReportReferral | null;
  consults?: ReportConsult[];
  lifecycle?: ReportLifecycle;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewVersion?: number;
  updatedAt?: string;
  metadataCorrectionAudits?: ReportAudit[];
  canonicalLinkage?: CanonicalCaseLink;
  advisory?: (Advisory & {
    selectedAt?: string | null;
    deliveryState?: AdvisoryDeliveryState;
    deliveredAt?: string | null;
    acknowledgedAt?: string | null;
  }) | null;
  reviewEvents?: ReportReviewEvent[];
  machineFacts?: ReportMachineFacts;
  attentionBand?: AttentionBand | null;
  attentionBandReasons?: string[];
  caseHistory?: ReportCaseHistory;
  identificationGap?: IdentificationGap;
}

export interface ReportReviewEvent {
  id: number;
  actor?: { uuid: string; name: string } | null;
  actionTaken?: ActionTaken | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome | null;
  notes?: string | null;
  caseState?: CaseState | null;
  createdAt: string;
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
  /** The one reviewer-facing workflow filter (six workflow states). */
  workflowStatus?: WorkflowStatus | "all";
  /** Field-validation assignee uuid (A3). */
  reviewer?: string;
  /** Derived compatibility projection; the actual lifecycle axes sit below. */
  status?: ReviewStatus | "all";
  caseState?: CaseState | "all";
  verificationOutcome?: VerificationOutcome | "all";
  fieldValidationState?: FieldValidationState | "all";
  staffClassifiedCondition?: AuthorityClassifiedCondition | "all";
  reportedConcern?: "rssi" | "all";
  followUpOutcome?: FollowUpOutcome | "all";
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
