import { queryOptions } from "@tanstack/react-query";
import type { ReportFilters } from "../domain/report.types";
import { reportsRepository } from "../services/reports.service";

export const reportKeys = {
  all: ["reports"] as const,
  lists: () => [...reportKeys.all, "list"] as const,
  list: (filters: ReportFilters) =>
    [...reportKeys.lists(), filters] as const,
  details: () => [...reportKeys.all, "detail"] as const,
  detail: (reportId: string) =>
    [...reportKeys.details(), reportId] as const,
};

export const reportsQueryOptions = (
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: reportKeys.list(filters),
    queryFn: () => reportsRepository.listReports(filters),
    enabled: options.enabled,
  });

export const reportQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => reportsRepository.getReportById(reportId),
    enabled: Boolean(reportId),
  });
