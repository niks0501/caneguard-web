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
} as const;

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
  "risk score",
  "uncertainty",
  "readiness %",
  "readiness percent",
] as const;

export function analyticsPeriodLine(periodLabel: string): string {
  return `${periodLabel}. ${ANALYTICS_TIMEZONE_LINE}`;
}
