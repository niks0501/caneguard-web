import { keepPreviousData, queryOptions, type Query } from "@tanstack/react-query";
import type { DiseaseReport, ReportFilters } from "../domain/report.types";
import { reportsRepository } from "../services/reports.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const reportKeys = {
  all: ["reports"] as const,
  advisories: () => ["advisories"] as const,
  lists: () => [...reportKeys.all, "list"] as const,
  list: (filters: ReportFilters) =>
    [...reportKeys.lists(), filters] as const,
  details: () => [...reportKeys.all, "detail"] as const,
  detail: (reportId: string) =>
    [...reportKeys.details(), reportId] as const,
  possibleMatches: (reportId: string) =>
    [...reportKeys.detail(reportId), "possible-matches"] as const,
  summary: (month?: string) =>
    [...reportKeys.all, "summary", month ?? "current"] as const,
};

export const aerialSettingsKey = ["aerial-analysis-settings"] as const;

export const aerialCheckLive = (gate: { installed: boolean; enabled: boolean }) =>
  gate.installed && gate.enabled;

export const isCaseDetailQuery = (query: Query) =>
  query.queryKey.length === reportKeys.detail("").length;

let aerialGateReads = 0;
let aerialOffReads = 0;

export const recordAerialGate = (gate: { installed: boolean; enabled: boolean }) => {
  aerialGateReads += 1;
  if (!aerialCheckLive(gate)) aerialOffReads += 1;
};

export const aerialGateReadCount = () => aerialGateReads;

export const aerialOffReadCount = () => aerialOffReads;

let caseReadsStarted = 0;
let caseReadsSettled = 0;

export const caseReadsStartedCount = () => caseReadsStarted;

export const caseReadsInFlight = () => caseReadsStarted - caseReadsSettled;

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

/**
 * A work queue read that is complete for ordinary office volumes, not silently
 * capped at one page. `total` stays the server's authoritative count and
 * `truncated` says plainly when the bounded read stopped before the last page.
 */
export const reportQueueReadPageSize = 100;
export const reportQueueReadMaxPages = 10;

export interface BoundedQueueRead {
  reports: DiseaseReport[];
  total: number;
  truncated: boolean;
  loadedPages: number;
}

export async function readQueuePages(
  filters: ReportFilters = {},
  maxPages = reportQueueReadMaxPages,
): Promise<BoundedQueueRead> {
  const first = await reportsRepository.listReports({
    ...filters,
    page: 1,
    perPage: reportQueueReadPageSize,
  });
  const reports = [...first.reports];
  let page = 1;
  while (page < first.meta.lastPage && page < maxPages) {
    page += 1;
    const next = await reportsRepository.listReports({
      ...filters,
      page,
      perPage: reportQueueReadPageSize,
    });
    reports.push(...next.reports);
  }

  return {
    reports,
    total: first.meta.total,
    truncated: reports.length < first.meta.total,
    loadedPages: page,
  };
}

export const reportQueueReadQueryOptions = (
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: [...reportKeys.lists(), "bounded-queue", filters] as const,
    queryFn: () => readQueuePages(filters),
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

export const reportQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: reportKeys.detail(reportId),
    queryFn: async () => {
      caseReadsStarted += 1;
      try {
        return await reportsRepository.getReportById(reportId);
      } finally {
        caseReadsSettled += 1;
      }
    },
    enabled: Boolean(reportId),
  });

export const possibleRecentMatchesQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: reportKeys.possibleMatches(reportId),
    queryFn: () => reportsRepository.getPossibleRecentMatches(reportId),
    enabled: Boolean(reportId),
  });
