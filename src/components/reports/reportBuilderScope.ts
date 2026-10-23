import type { ReportFilters } from "../../domain/report.types";
import {
  authorityClassifiedConditionLabels,
  caseStateLabels,
  diseaseLabels,
  fieldValidationStateLabels,
  verificationOutcomeLabels,
} from "../../domain/report.metadata";

/** Filters the printable document endpoint understands. */
export type BuilderFilters = {
  queue: string;
  predicted_label: string;
  barangay: string;
  case_state: string;
  verification_outcome: string;
  field_validation_state: string;
  authority_classified_condition: string;
};

export const emptyBuilderFilters: BuilderFilters = {
  queue: "",
  predicted_label: "",
  barangay: "",
  case_state: "",
  verification_outcome: "",
  field_validation_state: "",
  authority_classified_condition: "",
};

const queueLabels: Record<string, string> = {
  needs_review: "Needs Review",
  needs_visit: "Needs Visit",
  follow_up_due: "Follow-up Due",
  upcoming: "Upcoming Visits",
  unverified_no_active_work: "Unverified, no active work",
};

export interface PrintableBuilderScope {
  filters: BuilderFilters;
  /** A custom period is only derived when the queue had both boundaries. */
  customPeriod?: { from: string; to: string };
  /** Work-queue filters this document cannot honour, named so nothing vanishes. */
  removed: string[];
}

/**
 * D01: a printable report starts from the supported current work scope instead
 * of the builder's own remembered filters. Anything the document cannot express
 * is reported, never silently dropped.
 */
export function printableScopeFromReportFilters(filters: ReportFilters): PrintableBuilderScope {
  const removed: string[] = [];
  const next: BuilderFilters = {
    ...emptyBuilderFilters,
    queue: filters.queue ?? "",
    predicted_label: filters.disease ?? "",
    barangay: filters.barangay?.trim() ?? "",
    case_state: filters.caseState ?? "",
    verification_outcome: filters.verificationOutcome ?? "",
    field_validation_state: filters.fieldValidationState ?? "",
    authority_classified_condition: filters.staffClassifiedCondition ?? "",
  };

  if (filters.search?.trim()) removed.push("Search");
  if (filters.reportedConcern) removed.push("Reported concern");
  if (filters.workflowStatus) removed.push("Status");
  if (filters.status) removed.push("Status");
  if (filters.reviewer) removed.push("Field Inspector");
  if (filters.location) removed.push("Map location");

  let customPeriod: { from: string; to: string } | undefined;
  if (filters.dateFrom && filters.dateTo) {
    customPeriod = { from: filters.dateFrom, to: filters.dateTo };
  } else if (filters.dateFrom) {
    removed.push("From date");
  } else if (filters.dateTo) {
    removed.push("To date");
  }

  return { filters: next, customPeriod, removed: [...new Set(removed)] };
}

export function printableScopeIsApplied(
  state: { filters: BuilderFilters; periodType: string; from: string; to: string },
  scope: PrintableBuilderScope,
) {
  const filtersMatch = (Object.keys(scope.filters) as (keyof BuilderFilters)[])
    .every((key) => state.filters[key] === scope.filters[key]);
  if (!filtersMatch) return false;
  if (!scope.customPeriod) return true;
  return state.periodType === "custom"
    && state.from === scope.customPeriod.from
    && state.to === scope.customPeriod.to;
}

function named(map: Partial<Record<string, string>>, value: string) {
  return map[value] ?? value;
}

/** Names the filters the document is actually built from, never the arriving ones. */
export function printableScopeSummary(
  filters: BuilderFilters,
  periodLabel: string,
): string {
  const parts = [
    periodLabel,
    filters.queue ? `Queue: ${named(queueLabels, filters.queue)}` : "All work queues",
  ];
  if (filters.barangay) parts.push(`Barangay: ${filters.barangay}`);
  if (filters.predicted_label) parts.push(named(diseaseLabels, filters.predicted_label));
  if (filters.case_state) parts.push(`Case state: ${named(caseStateLabels, filters.case_state)}`);
  if (filters.verification_outcome) parts.push(`Verification: ${named(verificationOutcomeLabels, filters.verification_outcome)}`);
  if (filters.field_validation_state) parts.push(`Field validation: ${named(fieldValidationStateLabels, filters.field_validation_state)}`);
  if (filters.authority_classified_condition) parts.push(`Staff condition: ${named(authorityClassifiedConditionLabels, filters.authority_classified_condition)}`);
  return parts.join(" · ");
}
