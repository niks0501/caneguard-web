import { useQuery } from "@tanstack/react-query";
import { dashboardRepository } from "../services/dashboard.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => [...dashboardKeys.all, "summary"] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => dashboardRepository.getSummary(),
    ...getOperationalQueryRefreshOptions(),
  });
}
