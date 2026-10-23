import type {
  AuthorityClassifiedCondition,
  DiseaseReport,
  VerificationOutcome,
} from "../../domain/report.types";
import { legacyLifecycleForReviewStatus } from "../../data/api/mappers/lifecycle.mapper";

/**
 * The fields a review draft can disagree with the saved record about. A
 * conflict must be reconciled field by field: refreshing only the concurrency
 * token would let an old draft overwrite another reviewer's newer finding.
 */
export const conflictFields = [
  "classification",
  "verification",
  "action",
  "notes",
  "inspector",
  "targetDate",
] as const;

export type ConflictField = (typeof conflictFields)[number];
export type ConflictSnapshot = Record<ConflictField, string>;
export type ConflictChoices = Record<ConflictField, "latest" | "mine">;

function actionFromSaved(actionTaken: DiseaseReport["actionTaken"]): string {
  if (actionTaken === "no_further_action_required") return "close";
  if (actionTaken === "advisory_provided" || actionTaken === "technical_assistance_provided") {
    return "support";
  }
  if (actionTaken === "referred_for_expert_validation") return "field";
  return "";
}

/** The values the latest saved record actually holds. */
export function savedReviewSnapshot(report: DiseaseReport): ConflictSnapshot {
  const lifecycle = report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);
  return {
    classification: report.authorityClassifiedCondition ?? "",
    verification: lifecycle.verificationOutcome,
    action: actionFromSaved(report.actionTaken),
    notes: (report.reviewNotes ?? "").trim(),
    inspector: report.fieldValidationAssignment?.assignee.uuid ?? "",
    targetDate: report.fieldValidationAssignment?.targetVisitDate ?? "",
  };
}

/** Draft-side snapshot used to compare with the saved record. */
export function draftReviewSnapshot(values: {
  classification: AuthorityClassifiedCondition | null;
  verification: VerificationOutcome;
  action: string | null;
  notes: string;
  inspectorUuid: string;
  targetDate: string;
}): ConflictSnapshot {
  return {
    classification: values.classification ?? "",
    verification: values.verification,
    action: values.action ?? "",
    notes: values.notes.trim(),
    inspector: values.inspectorUuid,
    targetDate: values.targetDate,
  };
}
