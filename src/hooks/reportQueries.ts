import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ReportFilters } from "../domain/report.types";
import { reportsRepository } from "../services/reports.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const reportKeys = {
  all: ["reports"] as const,
  advisories: () => ["advisories"] as const,
  experts: () => ["experts"] as const,
  lists: () => [...reportKeys.all, "list"] as const,
  list: (filters: ReportFilters) =>
    [...reportKeys.lists(), filters] as const,
  expertLists: () => [...reportKeys.all, "expert-list"] as const,
  expertList: (filters: ReportFilters) =>
    [...reportKeys.expertLists(), filters] as const,
  details: () => [...reportKeys.all, "detail"] as const,
  detail: (reportId: string) =>
    [...reportKeys.details(), reportId] as const,
  possibleMatches: (reportId: string) =>
    [...reportKeys.detail(reportId), "possible-matches"] as const,
  summary: (month?: string) =>
    [...reportKeys.all, "summary", month ?? "current"] as const,
};

export const monthlySummaryQueryOptions = (month?: string) =>
  queryOptions({
    queryKey: reportKeys.summary(month),
    queryFn: () => reportsRepository.getMonthlySummary(month),
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });


export const reportsQueryOptions = (
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: reportKeys.list(filters),
    queryFn: () => reportsRepository.listReports(filters),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });

export const expertReportsQueryOptions = (
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: reportKeys.expertList(filters),
    queryFn: () => reportsRepository.listExpertQueue(filters),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });

export const advisoriesQueryOptions = () =>
  queryOptions({
    queryKey: reportKeys.advisories(),
    queryFn: () => reportsRepository.listAdvisories(),
    staleTime: 5 * 60 * 1000,
  });

export const expertDirectoryQueryOptions = () =>
  queryOptions({
    queryKey: reportKeys.experts(),
    queryFn: () => reportsRepository.listExperts(),
    staleTime: 5 * 60 * 1000,
  });

export const reportQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => reportsRepository.getReportById(reportId),
    enabled: Boolean(reportId),
  });

export const possibleRecentMatchesQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: reportKeys.possibleMatches(reportId),
    queryFn: () => reportsRepository.getPossibleRecentMatches(reportId),
    enabled: Boolean(reportId),
  });
