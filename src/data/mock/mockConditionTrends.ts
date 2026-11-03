import type {
  BarangayTrendRow,
  ConditionTrend,
  ConditionTrendGroup,
  ReportAnalytics,
} from "../../domain/dashboard.types";
import type { DiseaseReport } from "../../domain/report.types";
import { activeAuthorityClassifiedConditions } from "../../domain/report.metadata";

/** Mirrors `BuildConditionBarangayTrends::RISING_RATIO` / `RISING_MIN_CASES` / `TOP_BARANGAYS`. */
export const MOCK_RISING_RULE = { ratio: 2, minCases: 3 } as const;
const MOCK_TOP_BARANGAYS = 5;
const AI_CONDITIONS = ["healthy", "mosaic", "rust", "smut"] as const;

export function isRisingTrend(current: number, previous: number): boolean {
  return current >= MOCK_RISING_RULE.minCases && current >= MOCK_RISING_RULE.ratio * previous;
}

function trendFor(
  condition: string,
  matches: (report: DiseaseReport) => boolean,
  reports: DiseaseReport[],
  previousReports: DiseaseReport[],
  bucketOf: (report: DiseaseReport) => string,
  labels: string[],
): ConditionTrend {
  const counts = new Map(labels.map((label) => [label, 0]));
  let total = 0;
  reports.filter(matches).forEach((report) => {
    const bucket = bucketOf(report);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    total += 1;
  });
  const previousTotal = previousReports.filter(matches).length;
  return {
    condition,
    total,
    previousTotal,
    rising: isRisingTrend(total, previousTotal),
    series: labels.map((label) => ({ label, count: counts.get(label) ?? 0 })),
  };
}

function groupFor(
  declared: readonly string[],
  valueOf: (report: DiseaseReport) => string | null | undefined,
  reports: DiseaseReport[],
  previousReports: DiseaseReport[],
  bucketOf: (report: DiseaseReport) => string,
  labels: string[],
): ConditionTrendGroup {
  const build = (condition: string, matches: (report: DiseaseReport) => boolean) =>
    trendFor(condition, matches, reports, previousReports, bucketOf, labels);
  return {
    conditions: declared.map((condition) => build(condition, (report) => valueOf(report) === condition)),
    unclassified: build("unclassified", (report) => !declared.includes(valueOf(report) ?? "")),
  };
}

/** Per-condition and per-barangay trends in the API shape, over the mock reports. */
export function buildMockTrends(
  reports: DiseaseReport[],
  previousReports: DiseaseReport[],
  bucketOf: (report: DiseaseReport) => string,
  labels: string[],
): Pick<ReportAnalytics, "risingRule" | "seriesByCondition" | "seriesByBarangay"> {
  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  reports.forEach((report) => current.set(report.barangay, (current.get(report.barangay) ?? 0) + 1));
  previousReports.forEach((report) => previous.set(report.barangay, (previous.get(report.barangay) ?? 0) + 1));
  const rows: BarangayTrendRow[] = [...current.entries()]
    .map(([barangay, total]) => {
      const previousTotal = previous.get(barangay) ?? 0;
      return {
        barangay,
        total,
        previousTotal,
        delta: total - previousTotal,
        rising: isRisingTrend(total, previousTotal),
      };
    })
    .sort(
      (first, second) =>
        second.total - first.total ||
        second.previousTotal - first.previousTotal ||
        first.barangay.localeCompare(second.barangay),
    )
    .slice(0, MOCK_TOP_BARANGAYS);

  return {
    risingRule: { ...MOCK_RISING_RULE },
    seriesByCondition: {
      staffClassification: groupFor(
        activeAuthorityClassifiedConditions,
        (report) => report.authorityClassifiedCondition,
        reports,
        previousReports,
        bucketOf,
        labels,
      ),
      possibleCondition: groupFor(
        AI_CONDITIONS,
        (report) => report.predictedDisease,
        reports,
        previousReports,
        bucketOf,
        labels,
      ),
    },
    seriesByBarangay: { topN: MOCK_TOP_BARANGAYS, rows },
  };
}
