import type {
  ConditionTrend,
  ConditionTrendGroup,
  ReportAnalytics,
} from "../../domain/dashboard.types";

/** Test fixtures for the Trends payload: a quiet period with no cases anywhere. */
export function quietTrend(condition: string, labels: string[] = []): ConditionTrend {
  return {
    condition,
    total: 0,
    previousTotal: 0,
    rising: false,
    series: labels.map((label) => ({ label, count: 0 })),
  };
}

export function quietGroup(conditions: string[], labels: string[] = []): ConditionTrendGroup {
  return {
    conditions: conditions.map((condition) => quietTrend(condition, labels)),
    unclassified: quietTrend("unclassified", labels),
  };
}

export const quietTrends: Pick<
  ReportAnalytics,
  "risingRule" | "seriesByCondition" | "seriesByBarangay"
> = {
  risingRule: { ratio: 2, minCases: 3 },
  seriesByCondition: {
    staffClassification: quietGroup(["smut", "mosaic", "rust", "rssi"]),
    possibleCondition: quietGroup(["healthy", "mosaic", "rust", "smut"]),
  },
  seriesByBarangay: { topN: 5, rows: [] },
};
