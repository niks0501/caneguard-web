import type {
  ActionTaken,
  AuthorityClassifiedCondition,
  CaseState,
  FieldValidationState,
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
