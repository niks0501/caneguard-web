import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
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
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });

export function useAnalytics(params: ReportAnalyticsParams, options?: { enabled?: boolean }) {
  return useQuery({
    ...analyticsQueryOptions(params),
    enabled: options?.enabled,
  });
}
