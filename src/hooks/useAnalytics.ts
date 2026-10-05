import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ReportAnalyticsParams } from "../domain/dashboard.types";
import { dashboardRepository } from "../services/dashboard.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const analyticsKeys = {
  all: ["analytics"] as const,
  period: (params: ReportAnalyticsParams) =>
    [...analyticsKeys.all, "period", params] as const,
};

export const analyticsQueryOptions = (params: ReportAnalyticsParams) =>
  queryOptions({
    queryKey: analyticsKeys.period(params),
    queryFn: () => dashboardRepository.getAnalytics(params),
    // A new scope must never render the previous scope's aggregate as its own.
    // Overhaul P1: the aggregates are expensive, so a window-focus refetch
    // is skipped while the data is younger than 60s (React Query only
    // refetches on focus when the data is stale).
    staleTime: 60_000,
    ...getOperationalQueryRefreshOptions(),
  });

export function useAnalytics(params: ReportAnalyticsParams, options?: { enabled?: boolean }) {
  return useQuery({
    ...analyticsQueryOptions(params),
    enabled: options?.enabled,
  });
}
