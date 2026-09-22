/**
 * Single copy contract for the analytics charts (plan section 6, Phase 1).
 *
 * Every chart prints its period, boundary rule and timezone; counts are
 * always "submitted reports", never bare "cases"; the comparison is a delta
 * between two counts with no projection. The FORBIDDEN_WORDS list mirrors
 * plan section 5 — if any of those claims ever appears in chart copy, the
 * chart-copy test fails the build.
 */

export const ANALYTICS_TIMEZONE_LINE = "Period boundaries use PHT (UTC+8).";

export const ANALYTICS_EMPTY_STATE =
  "No submitted reports in this period.";

export const analyticsCopy = {
  series: {
    title: "Submitted reports over time",
    description:
      "How many submitted reports came in across the selected period. Counts of submitted reports, not of confirmed occurrences.",
  },
  barangay: {
    title: "Submitted reports by barangay",
    description:
      "Where submitted reports are concentrated. Higher concentration of submitted reports in a barangay is an operational count, and barangay counts come first; GPS detail stays on the field map.",
  },
  condition: {
    title: "Submitted reports by Possible Condition",
    tag: "Possible Condition — decision support only",
    description:
      "Which possible conditions the AI evidence suggests. Healthy stays visible. Possible conditions are decision support, not diagnoses.",
  },
  caseState: {
    title: "Open vs closed submitted reports",
    description:
      "How much of the register is still open. Counts of submitted reports, not of confirmed occurrences.",
  },
  comparison: {
    title: "Previous-period comparison",
    description:
      "This period against the last comparable one: two counts and a delta. The delta describes what happened; it says nothing about what comes next.",
  },
  lifecycle: {
    title: "Where work sits in the lifecycle",
    description:
      "Submitted reports split by verification outcome, field-validation state and referral state. Referral is a supporting state here, not a separate process.",
    verificationOutcome: "Verification outcome",
    fieldValidationState: "Field-validation state",
    referralState: "Referral state",
  },
  area: {
    title: "Estimated affected area",
    description:
      "How much estimated area submitted reports describe. An estimate from submitted reports, split by how it was recorded.",
  },
  workload: {
    title: "Field-validation workload",
    description:
      "Open validation work per assignee, for balancing load only. Listed alphabetically, never ranked; unassigned work is its own bucket.",
  },
  schedule: {
    title: "Validation schedule against target dates",
    description:
      "Open validation work against its recorded target visit date. Unscheduled work is always shown, so past-target work is never read as the whole backlog.",
  },
  backlog: {
    title: "Review backlog by waiting age",
    description:
      "Submitted reports waiting for a first review, grouped by how long they have waited. Waiting age only; no deadline applies.",
  },
  turnaround: {
    title: "Field-validation turnaround",
    description:
      "How long completed validations actually took, from assignment activation to the visit. Measured durations only, with no target comparison.",
  },
} as const;

export function areaDisclosureLine(area: {
  contributingReports: number;
  estimatedHectares: number;
  measuredReports: number;
  measuredHectares: number;
  notMeasuredReports: number;
  notMeasuredHectares: number;
  linkedDuplicatesExcluded: number;
  overlapNote: string;
}): string {
  const reports = `${area.contributingReports} ${area.contributingReports === 1 ? "submitted report" : "submitted reports"}`;
  const duplicates = `${area.linkedDuplicatesExcluded} ${area.linkedDuplicatesExcluded === 1 ? "linked duplicate" : "linked duplicates"} excluded`;
  return (
    `${reports} contribute an estimated ${area.estimatedHectares} ha ` +
    `(${area.measuredReports} measured at ${area.measuredHectares} ha, ` +
    `${area.notMeasuredReports} not measured at ${area.notMeasuredHectares} ha). ` +
    `${duplicates}; ${area.overlapNote}`
  );
}

/** Vocabulary from plan section 5 that must never appear in chart copy. */
export const ANALYTICS_FORBIDDEN_WORDS = [
  "hotspot",
  "outbreak",
  "prevalence",
  "incidence",
  "infection rate",
  "accuracy",
  "accurate",
  "forecast",
  "projection",
  "predicted trend",
  "leaderboard",
  "ranking",
  "fastest",
  "slowest",
  "best validator",
  "worst",
  "overdue",
  "sla",
  "total affected area",
  "risk score",
  "uncertainty",
  "readiness %",
  "readiness percent",
] as const;

export function analyticsPeriodLine(periodLabel: string): string {
  return `${periodLabel}. ${ANALYTICS_TIMEZONE_LINE}`;
}
