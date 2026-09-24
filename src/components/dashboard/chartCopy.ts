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
    hint: "Reporter observation vs AI decision support, not a diagnosis.",
    verificationStrip: "Staff verification so far",
  },
  barangayValidation: {
    title: "Validation attention by barangay",
    hint: "Past target date uses the recorded target visit date.",
  },
  locationMap: {
    title: "Field-report locations — Nasugbu",
    hint: "Barangay counts; GPS points are indicative.",
    barangayLayer: "Barangay circles",
    gpsLayer: "GPS points",
  },
} as const;
