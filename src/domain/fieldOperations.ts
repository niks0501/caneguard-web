import type { FieldValidationQueueItem } from "./fieldValidation.types";
import type {
  CaseState,
  DiseaseKey,
  FieldValidationState,
  FollowUpOutcome,
  LocationSource,
  ReportLifecycle,
  ReviewStatus,
} from "./report.types";
import type { DiseaseReport } from "./report.types";
import { addScheduleDays } from "./monitoringSchedule";

/**
 * Assignments workload vocabulary.
 *
 * The default presentation is three mutually exclusive sections ordered by the
 * approved priority Overdue -> Unassigned -> Upcoming. `Upcoming` is the
 * remainder of assigned active workload, so due-today and undated assigned
 * visits both belong there; undated rows say "Not scheduled" and never invent
 * a relative timing. All date arithmetic uses the Asia/Manila office date.
 */
export type FieldOperationSection = "overdue" | "unassigned" | "upcoming";

export const fieldOperationSectionOrder: readonly FieldOperationSection[] = [
  "overdue",
  "unassigned",
  "upcoming",
] as const;

export const fieldOperationSectionLabels: Record<FieldOperationSection, string> = {
  overdue: "Overdue",
  unassigned: "Unassigned",
  upcoming: "Upcoming",
};

export interface FieldWorkloadAssignee {
  uuid: string;
  name: string;
}

/** Normalized read-first workload row shared by both read boundaries. */
export interface FieldWorkloadItem {
  uuid: string;
  reviewVersion?: number;
  referenceCode: string;
  barangay: string;
  farmReference: string | null;
  municipality: string | null;
  province: string | null;
  predictedDisease: DiseaseKey;
  observedAt: string | null;
  submittedAt: string;
  reviewStatus: ReviewStatus;
  lifecycle: ReportLifecycle | undefined;
  fieldValidationState: FieldValidationState;
  targetVisitDate: string | null;
  assignee: FieldWorkloadAssignee | null;
  finalLatitude: number | null;
  finalLongitude: number | null;
  locationSource: LocationSource | null;
  caseState: CaseState | undefined;
  scheduledRevisit: boolean;
  followUpOutcome: FollowUpOutcome | null;
}

function fieldValidationStateOf(report: DiseaseReport): FieldValidationState {
  return report.lifecycle?.fieldValidationState
    ?? (report.fieldValidationAssignment ? "assigned" : "unassigned");
}

export function fieldWorkloadItemFromReport(report: DiseaseReport): FieldWorkloadItem {
  return {
    uuid: report.uuid,
    reviewVersion: report.reviewVersion,
    referenceCode: report.referenceCode,
    barangay: report.barangay,
    farmReference: report.farmReference ?? null,
    municipality: report.municipality ?? null,
    province: report.province ?? null,
    predictedDisease: report.predictedDisease,
    observedAt: report.observedAt ?? null,
    submittedAt: report.submittedAt,
    reviewStatus: report.reviewStatus,
    lifecycle: report.lifecycle,
    fieldValidationState: fieldValidationStateOf(report),
    targetVisitDate: report.fieldValidationAssignment?.targetVisitDate ?? null,
    assignee: report.fieldValidationAssignment?.assignee ?? null,
    finalLatitude: report.finalLatitude ?? null,
    finalLongitude: report.finalLongitude ?? null,
    locationSource: report.locationSource ?? null,
    caseState: report.lifecycle?.caseState,
    scheduledRevisit: Boolean(report.scheduledRevisit),
    followUpOutcome: report.latestValidation?.followUpOutcome ?? null,
  };
}

export function fieldWorkloadItemFromQueueItem(item: FieldValidationQueueItem): FieldWorkloadItem {
  return {
    uuid: item.uuid,
    reviewVersion: item.reviewVersion,
    referenceCode: item.referenceCode,
    barangay: item.barangay,
    farmReference: null,
    municipality: item.municipality,
    province: item.province,
    predictedDisease: item.predictedDisease,
    observedAt: item.observedAt,
    submittedAt: item.submittedAt,
    reviewStatus: item.reviewStatus,
    lifecycle: item.lifecycle,
    fieldValidationState: item.lifecycle?.fieldValidationState ?? (item.assignee ? "assigned" : "unassigned"),
    targetVisitDate: item.targetVisitDate ?? null,
    assignee: item.assignee ?? null,
    finalLatitude: item.finalLatitude,
    finalLongitude: item.finalLongitude,
    locationSource: item.locationSource,
    caseState: item.lifecycle?.caseState,
    scheduledRevisit: Boolean(item.scheduledRevisit),
    followUpOutcome: item.followUpOutcome ?? null,
  };
}

/**
 * Completed visits and closed cases are not active work and never enter the
 * default sections. The union of the sections equals the active workload.
 */
export function isActiveFieldWorkloadItem(item: FieldWorkloadItem): boolean {
  if (item.fieldValidationState === "completed") return false;
  if (item.caseState === "closed") return false;
  return true;
}

/** Priority rule: Overdue -> Unassigned -> Upcoming. Today is never overdue. */
export function fieldOperationSection(
  item: Pick<FieldWorkloadItem, "targetVisitDate" | "assignee">,
  officeDate: string,
): FieldOperationSection {
  const target = item.targetVisitDate;
  if (target && target < officeDate) return "overdue";
  if (!item.assignee) return "unassigned";
  return "upcoming";
}

/**
 * Relative operational timing. Undated visits have no defensible relative
 * timing and return null so the row can say "Not scheduled".
 */
export function relativeVisitTiming(
  targetVisitDate: string | null,
  officeDate: string,
): string | null {
  if (!targetVisitDate) return null;

  if (targetVisitDate < officeDate) {
    const days = daysBetween(targetVisitDate, officeDate);
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  if (targetVisitDate === officeDate) return "Due today";
  if (targetVisitDate === addScheduleDays(officeDate, 1)) return "Due tomorrow";

  const days = daysBetween(officeDate, targetVisitDate);
  return `In ${days} days`;
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

export interface FieldWorkloadSummary {
  overdue: number;
  unassigned: number;
  upcoming: number;
  assigned: number;
  total: number;
}

/** Counts describe the complete authorized active workload, never one page. */
export function summarizeFieldWorkload(
  items: readonly FieldWorkloadItem[],
  officeDate: string,
): FieldWorkloadSummary {
  const summary: FieldWorkloadSummary = {
    overdue: 0,
    unassigned: 0,
    upcoming: 0,
    assigned: 0,
    total: 0,
  };

  for (const item of items) {
    if (!isActiveFieldWorkloadItem(item)) continue;
    summary.total += 1;
    if (item.assignee) summary.assigned += 1;
    summary[fieldOperationSection(item, officeDate)] += 1;
  }

  return summary;
}

/** Partition the active workload into the three mutually exclusive sections. */
export function groupFieldWorkloadBySection(
  items: readonly FieldWorkloadItem[],
  officeDate: string,
): Record<FieldOperationSection, FieldWorkloadItem[]> {
  const groups: Record<FieldOperationSection, FieldWorkloadItem[]> = {
    overdue: [],
    unassigned: [],
    upcoming: [],
  };

  for (const item of items) {
    if (!isActiveFieldWorkloadItem(item)) continue;
    groups[fieldOperationSection(item, officeDate)].push(item);
  }

  return groups;
}

export function groupFieldWorkloadByBarangay(
  items: readonly FieldWorkloadItem[],
): Array<{ barangay: string; items: FieldWorkloadItem[] }> {
  const groups = new Map<string, FieldWorkloadItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.barangay);
    if (bucket) bucket.push(item);
    else groups.set(item.barangay, [item]);
  }

  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([barangay, groupedItems]) => ({ barangay, items: groupedItems }));
}

/**
 * Reason for Visit is derived from existing authoritative lifecycle, review, or
 * visit state. It never fabricates a reason: unsupported rows return null and
 * the field is omitted.
 */
export function deriveReasonForVisit(item: FieldWorkloadItem): string | null {
  if (item.scheduledRevisit || item.followUpOutcome) return "Follow-up visit";
  if (item.fieldValidationState === "in_progress") return "Continue field validation";
  if (item.fieldValidationState === "assigned") return "Scheduled field validation";
  if (item.fieldValidationState === "unassigned" && item.reviewStatus === "for_field_validation") {
    return "Field validation required";
  }
  return null;
}

export function hasUsableReportLocation(item: {
  finalLatitude: number | null;
  finalLongitude: number | null;
}): boolean {
  const { finalLatitude: latitude, finalLongitude: longitude } = item;
  return (
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
  );
}

/**
 * Union two authorized reads by identity so a page that is also fed by the
 * complete queue never loses an item the reports read supplied first.
 */
export function mergeFieldWorkload(
  primary: readonly FieldWorkloadItem[],
  secondary: readonly FieldWorkloadItem[],
): FieldWorkloadItem[] {
  const merged = new Map<string, FieldWorkloadItem>();
  for (const item of secondary) merged.set(item.uuid, item);
  for (const item of primary) {
    const existing = merged.get(item.uuid);
    merged.set(item.uuid, existing ? { ...existing, ...item } : item);
  }
  return [...merged.values()];
}

/** Frozen same-date ordering: target date, observed date, submitted, identity. */
export function compareFieldWorkloadItems(
  left: Pick<FieldWorkloadItem, "targetVisitDate" | "observedAt" | "submittedAt" | "uuid">,
  right: Pick<FieldWorkloadItem, "targetVisitDate" | "observedAt" | "submittedAt" | "uuid">,
): number {
  // Undated work sorts last; it is neither overdue nor nearby.
  const leftTarget = left.targetVisitDate ?? "\uffff";
  const rightTarget = right.targetVisitDate ?? "\uffff";
  if (leftTarget !== rightTarget) return leftTarget < rightTarget ? -1 : 1;

  if (left.observedAt && right.observedAt) {
    if (left.observedAt !== right.observedAt) return left.observedAt < right.observedAt ? -1 : 1;
  } else if (left.observedAt && !right.observedAt) {
    return -1;
  } else if (!left.observedAt && right.observedAt) {
    return 1;
  }

  if (left.submittedAt !== right.submittedAt) return left.submittedAt < right.submittedAt ? -1 : 1;
  if (left.uuid !== right.uuid) return left.uuid < right.uuid ? -1 : 1;
  return 0;
}
