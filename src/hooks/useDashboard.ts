import { useQuery } from "@tanstack/react-query";
import { dashboardRepository } from "../services/dashboard.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: (month?: string) =>
    [...dashboardKeys.all, "summary", month ?? "current"] as const,
};

export function useDashboard(month?: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(month),
    queryFn: () => dashboardRepository.getSummary(month),
    placeholderData: (previousData) => previousData,
    ...getOperationalQueryRefreshOptions(),
  });
}
