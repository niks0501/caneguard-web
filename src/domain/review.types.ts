import type {
  ActionTaken,
  AuthorityClassifiedCondition,
  CaseState,
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

export interface ReportReferralInput {
  destination: string;
  reference: string;
  referralDate: string;
  dueDate?: string | null;
  expertName?: string | null;
  expertContact?: string | null;
  note?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  officeNotes?: string | null;
  expectedVersion: number;
}

export interface ExpertReferralResponseInput {
  responseDate: string;
  responseNote?: string | null;
  responseFinding?: string | null;
  findingRecommendation?: string | null;
  findingSource?: FindingSource | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  expectedVersion: number;
}

export interface DuplicateLinkInput {
  canonicalReportUuid: string;
  reason?: string;

}

export interface ReportReviewInput {
  // Kept for older Web clients while the independent lifecycle contract rolls
  // out. New callers should use the fields below.
  status?: Exclude<ReviewStatus, "submitted_unverified">;
  notes?: string | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  verificationOutcome?: VerificationOutcome;
  actionTaken?: ActionTaken | null;
  fieldValidationState?: FieldValidationState;
  fieldValidationAssigneeUuid?: string | null;
  fieldValidationTargetDate?: string | null;
  caseState?: CaseState;
  metadataCorrections?: OperationalMetadataCorrections;
  correctionReason?: string;
  expectedVersion: number;
}
