/**
 * Shared dashboard copy constants.
 *
 * Counts are always "submitted reports", never bare "cases"; the comparison
 * is a delta between two counts with no projection. The FORBIDDEN_WORDS list
 * mirrors plan section 5 — if any of those claims ever appears in chart copy,
 * the chart-copy tests fail the build.
 *
 * Time targets are a deliberate, narrow exception to the original
 * "descriptive durations only, no target comparison" doctrine: the review
 * target (3 days from submission) and the field-visit target (7 days from
 * assignment) are the only two, defined as `REVIEW_TARGET_DAYS` and
 * `VISIT_TARGET_DAYS` in `BuildReportAnalytics.php` and printed beside the
 * measured values on the Team throughput cards. The words "sla" and
 * "overdue" stay forbidden: a target is a reference, never a verdict or a
 * ranking of people.
 */

/**
 * The dashboard names its timezone exactly once, through this constant (the
 * page description). Cards print plain times and must never repeat it.
 */
export const DASHBOARD_TIMEZONE_LABEL = "PHT (UTC+8)";

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
