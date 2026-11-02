/**
 * Copy contract for the three decision charts and the map (overhaul §3.4).
 *
 * Minimum copy: a title, and at most one short hint where a claim is needed
 * to keep the four vocabularies apart (submitted / reported concern / AI
 * classification / verified case). Long explanations, period-boundary
 * timezone prose and "what to do" takeaways are deliberately absent — the
 * marks, printed values and legends carry the reading.
 */

export const dashboardChartCopy = {
  inflow: {
    title: "Inflow: this period vs the previous period",
  },
  concernVsCondition: {
    title: "Reported concern vs Possible Condition",
    verificationStrip: "Staff verification so far",
  },
  barangayValidation: {
    title: "Validation attention by barangay",
  },
  locationMap: {
    title: "Field-report locations — Nasugbu",
    barangayLayer: "Barangay circles",
    gpsLayer: "GPS points",
  },
} as const;

/**
 * Team throughput copy (Trends). Titles, a plain scope line and an empty
 * message per card. The two time targets are not worded here: the API sends
 * the day counts (`BuildReportAnalytics::REVIEW_TARGET_DAYS` and
 * `VISIT_TARGET_DAYS`) and the card prints them beside the measured value.
 */
export const throughputCopy = {
  heading: "Team throughput",
  reviewTime: {
    title: "Median time to first review",
    empty: "No reviewed reports in this period or the previous one.",
  },
  backlog: {
    title: "Review backlog by waiting age",
    scope: "Current queue, all submission dates",
    empty: "No submitted reports are waiting for a first review.",
  },
  workload: {
    title: "Open field-validation work per assignee",
    empty: "No open field-validation work in this period.",
  },
  turnaround: {
    title: "Field-validation turnaround",
    empty: "No completed validations in this period.",
  },
} as const;
