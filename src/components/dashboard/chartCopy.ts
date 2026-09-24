import { ANALYTICS_TIMEZONE_LINE } from "./analyticsCopy";

/**
 * Copy contract for the three decision charts and the map (overhaul §3.4).
 * Adds to analyticsCopy.ts, never forks it: every card prints its windows
 * with the timezone, states one takeaway line, and keeps the four
 * vocabularies (submitted / reported concern / AI classification / verified
 * case) strictly apart.
 */

export const dashboardChartCopy = {
  inflow: {
    title: "Inflow: this period vs the previous period",
    description:
      "Submitted reports per bucket, this period against the same-length previous period. Two counts and a delta; the delta describes what happened and says nothing about what comes next.",
    takeaway: "Change review capacity when the current period outpaces the previous one.",
  },
  concernVsCondition: {
    title: "Reported concern vs Possible Condition",
    description:
      "Reported concern is what the reporter observed. Possible Condition is AI decision support only. Neither is a diagnosis; the two are shown together so they can be compared, never merged.",
    takeaway:
      "Read the reported series against the AI series before trusting a suggestion.",
    verificationStrip: "Staff verification so far",
  },
  barangayValidation: {
    title: "Validation attention by barangay",
    description:
      "Barangay first. Submitted reports this period set the baseline bar; open validation work splits into past target date, scheduled ahead and unscheduled. Past target date is measured against the target visit date recorded on the assignment, not a policy deadline. Every scope barangay counts; only barangays with reports in this period are drawn.",
    takeaway: "Send the next field visit where past-target work piles up.",
  },
  locationMap: {
    title: "Field-report locations — Nasugbu",
    description:
      "Barangay is the reporting unit. GPS points are indicative and only exist where a device recorded a location.",
    barangayLayer: "Barangay circles",
    gpsLayer: "GPS points",
    takeaway: "Circles size with submitted reports; points are indicative device locations.",
  },
} as const;

export function chartPeriodLine(label: string): string {
  return `${label}. ${ANALYTICS_TIMEZONE_LINE}`;
}
