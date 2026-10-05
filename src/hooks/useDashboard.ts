import { useQuery } from "@tanstack/react-query";
import type { DashboardSummaryOptions } from "../data/contracts/DashboardRepository";
import { dashboardRepository } from "../services/dashboard.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: (month?: string, options?: DashboardSummaryOptions) =>
    [...dashboardKeys.all, "summary", month ?? "current", options ?? {}] as const,
};

/** First-paint slice: counts, queues and the 10 most recent reports. */
export const dashboardSummaryOptions: DashboardSummaryOptions = {
  include: "counts,queues,recent,monthly",
  recentLimit: 10,
};

export function useDashboard(month?: string, options?: DashboardSummaryOptions) {
  return useQuery({
    queryKey: dashboardKeys.summary(month, options),
    queryFn: () => dashboardRepository.getSummary(month, options),
    placeholderData: (previousData) => previousData,
    ...getOperationalQueryRefreshOptions(),
  });
}
