import type {
  ActionTaken,
  AuthorityClassifiedCondition,
  CaseState,
  ConsultReviewOutcome,
  FieldValidationState,
  FindingSource,
  ReviewStatus,
  VerificationOutcome,
} from "./report.types";

export interface OperationalMetadataCorrections {
  barangay?: string;
  farmerOrFarmOwnerName?: string | null;
  province?: string | null;
  municipality?: string | null;
  affectedAreaHectares?: number | null;
  affectedPortionPercent?: number | null;
  finalLatitude?: number | null;
  finalLongitude?: number | null;
  locationSource?: "gps" | "manual_map" | null;
  gpsAccuracy?: number | null;
}

export interface ExpertDirectoryEntry {
  uuid: string;
  name: string;
  email: string;
}

export interface ReportReferralInput {
  destination: string;
  reference?: string | null;
  referralDate: string;
  dueDate?: string | null;
  expertUuid?: string | null;
  expertName?: string | null;
  expertContact?: string | null;
  shareFullContext?: boolean;
  note?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  officeNotes?: string | null;
  expectedVersion: number;
}

export interface ExpertReferralResponseInput {
  responseDate: string;
  reference?: string | null;
  responseNote?: string | null;
  responseFinding?: string | null;
  findingRecommendation?: string | null;
  findingSource?: FindingSource | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  expectedVersion: number;
}

export interface ExpertFindingInput {
  reference?: string | null;
  conditionOpinion?: AuthorityClassifiedCondition | null;
  symptomVerdicts?: Record<string, { verdict: "present" | "absent" | "unsure"; note?: string | null }>;
  basis?: string | null;
  confidence?: "low" | "medium" | "high" | null;
  recommendation?: string | null;
  consultStatus?: "in_progress" | "completed" | "cancelled";
  responseDate?: string | null;
  expectedVersion: number;
}

export interface ConsultInvite {
  url: string;
  photoUrl?: string;
  consultId: number;
  issuedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  accessCount: number;
  shareFullContext: boolean;
}

export interface ConfirmExpertReferralInput {
  consultReviewOutcome: ConsultReviewOutcome;
  consultReviewNote?: string | null;
  expectedVersion: number;
}

export interface DuplicateLinkInput {
  canonicalReportUuid: string;
  reason?: string;
  expectedVersion: number;
}

export interface DuplicateUnlinkInput {
  reason?: string;
  expectedVersion: number;
}

export interface ReportReviewInput {
  // Kept for older Web clients while the independent lifecycle contract rolls
  // out. New callers should use the fields below.
  status?: Exclude<ReviewStatus, "submitted_unverified">;
  notes?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  actionTaken?: ActionTaken | null;
  advisoryUuid?: string | null;
  fieldValidationState?: FieldValidationState;
  fieldValidationAssigneeUuid?: string | null;
  fieldValidationTargetDate?: string | null;
  caseState?: CaseState;
  metadataCorrections?: OperationalMetadataCorrections;
  correctionReason?: string;
  expectedVersion: number;
}
