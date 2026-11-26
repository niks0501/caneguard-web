import { predictedDiseaseLabel } from "../../domain/report.metadata";
import type {
  DiseaseKey,
  DiseaseReport,
  ImageStatus,
  PossibleRecentMatch,
} from "../../domain/report.types";
import { deriveWorkflowStatus, workflowStatusLabels } from "../../domain/workflowStatus";

/** One case, reduced to the facts a reviewer compares side by side. */
export interface CompareCase {
  uuid: string;
  referenceCode: string;
  submittedAt: string;
  barangay: string;
  farmer: string | null;
  reporter: string | null;
  condition: DiseaseKey | null;
  status: string;
  imageStatus: ImageStatus;
  imageUrl?: string;
  distanceMeters?: number;
}

/** "Rust", "Mosaic", "No supported disease detected" (or "No AI scan"). */
export function conditionName(condition: DiseaseKey | null): string {
  return predictedDiseaseLabel(condition).replace(/^Possible Condition:\s*/, "");
}

/** Reads as a model result, never a diagnosis: "Possible Rust". */
export function possibleConditionName(condition: DiseaseKey | null): string {
  return condition && condition !== "healthy" ? `Possible ${conditionName(condition)}` : conditionName(condition);
}

export function compareCaseFromReport(report: DiseaseReport): CompareCase {
  return {
    uuid: report.uuid,
    referenceCode: report.referenceCode,
    submittedAt: report.submittedAt,
    barangay: report.barangay,
    farmer: report.farmerOrFarmOwnerName?.trim() || null,
    reporter: report.submittedByName || null,
    condition: report.predictedDisease,
    status: workflowStatusLabels[deriveWorkflowStatus(report)],
    imageStatus: report.imageStatus,
    imageUrl: report.imageUrl,
  };
}

export function compareCaseFromMatch(match: PossibleRecentMatch): CompareCase {
  return {
    uuid: match.uuid,
    referenceCode: match.referenceCode,
    submittedAt: match.submittedAt,
    barangay: match.barangay,
    farmer: match.farmerOrFarmOwnerName?.trim() || null,
    reporter: match.submittedByName,
    condition: match.condition,
    status: workflowStatusLabels[match.workflowStatus],
    imageStatus: match.imageStatus === "available" && match.imageUrl ? "available" : "unavailable",
    imageUrl: match.imageUrl ?? undefined,
    distanceMeters: match.distanceMeters,
  };
}

export const sameText = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();
