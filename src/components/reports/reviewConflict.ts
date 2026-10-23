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

export interface ActionSelection {
  action: string;
  support: "advisory" | "technical";
  advisoryUuid: string;
}

function actionFromSaved(actionTaken: DiseaseReport["actionTaken"]): string {
  if (actionTaken === "no_further_action_required") return "close";
  if (actionTaken === "advisory_provided" || actionTaken === "technical_assistance_provided") {
    return "support";
  }
  if (actionTaken === "referred_for_expert_validation") return "field";
  return "";
}

/**
 * The next action is one value, not two: the support sub-type and the selected
 * advisory decide which action is submitted, so they travel as its token.
 */
export function actionToken(selection: ActionSelection): string {
  if (selection.action !== "support") return selection.action;
  return selection.support === "technical"
    ? "support:technical"
    : `support:advisory:${selection.advisoryUuid}`;
}

export function parseActionToken(token: string): ActionSelection {
  const [action = "", support, advisoryUuid = ""] = token.split(":");
  if (action !== "support") return { action, support: "advisory", advisoryUuid: "" };
  return support === "technical"
    ? { action, support: "technical", advisoryUuid: "" }
    : { action, support: "advisory", advisoryUuid };
}

/** The values the latest saved record actually holds. */
export function savedReviewSnapshot(report: DiseaseReport): ConflictSnapshot {
  const lifecycle = report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);
  const action = actionFromSaved(report.actionTaken);
  return {
    classification: report.authorityClassifiedCondition ?? "",
    verification: lifecycle.verificationOutcome,
    action: actionToken({
      action,
      support: report.actionTaken === "technical_assistance_provided" ? "technical" : "advisory",
      advisoryUuid: action === "support" ? (report.advisory?.uuid ?? "") : "",
    }),
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
  support: "advisory" | "technical";
  advisoryUuid: string;
  notes: string;
  inspectorUuid: string;
  targetDate: string;
}): ConflictSnapshot {
  return {
    classification: values.classification ?? "",
    verification: values.verification,
    action: actionToken({ action: values.action ?? "", support: values.support, advisoryUuid: values.advisoryUuid }),
    notes: values.notes.trim(),
    inspector: values.inspectorUuid,
    targetDate: values.targetDate,
  };
}
