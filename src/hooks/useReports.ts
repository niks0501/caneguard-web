import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportFilters } from "../domain/report.types";
import type {
  DuplicateLinkInput,
  ReportReviewInput,
} from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
  possibleRecentMatchesQueryOptions,
  reportKeys,
  reportQueryOptions,
  reportsQueryOptions,
} from "./reportQueries";
import { invalidateReportDependentQueries } from "./reportInvalidation";

export function useReports(
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery(reportsQueryOptions(filters, options));
}

export function useReport(reportId: string) {
  return useQuery(reportQueryOptions(reportId));
}

export function usePossibleRecentMatches(reportId: string) {
  return useQuery(possibleRecentMatchesQueryOptions(reportId));
}

export function useUpdateReportReview(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportReviewInput) =>
      reportsRepository.updateReview(reportId, input),
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.detail(reportId), report);
      return invalidateReportDependentQueries(queryClient, { reportId });
    },
  });
}

export function useLinkDuplicateReport(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DuplicateLinkInput) =>
      reportsRepository.linkDuplicate(reportId, input),
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.detail(reportId), report);
      return invalidateReportDependentQueries(queryClient, { reportId });
    },
  });
}
