import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiseaseReport, ReportFilters } from "../domain/report.types";
import type {
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ReportReviewInput,
  HandoffNoteInput,
} from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
  advisoriesQueryOptions,
  monthlySummaryQueryOptions,
  possibleRecentMatchesQueryOptions,
  reportKeys,
  reportQueryOptions,
  reportsQueryOptions,
} from "./reportQueries";
import { invalidateReportDependentQueries } from "./reportInvalidation";

export function useMonthlyReportSummary(month?: string) {
  return useQuery(monthlySummaryQueryOptions(month));
}

export function useAdvisories() {
  return useQuery(advisoriesQueryOptions());
}

export function useReports(
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery(reportsQueryOptions(filters, options));
}

export function useExportReports() {
  return useMutation({
    mutationFn: (filters: ReportFilters) => reportsRepository.exportReports(filters),
  });
}

export function useReport(reportId: string) {
  return useQuery(reportQueryOptions(reportId));
}

function useReportMutation<TInput>(
  reportId: string,
  mutationFn: (input: TInput) => Promise<DiseaseReport>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.detail(reportId), report);
      return invalidateReportDependentQueries(queryClient, { reportId });
    },
  });
}

export function usePossibleRecentMatches(reportId: string) {
  return useQuery(possibleRecentMatchesQueryOptions(reportId));
}

export function useUpdateReportReview(reportId: string) {
  return useReportMutation<ReportReviewInput>(
    reportId,
    (input) => reportsRepository.updateReview(reportId, input),
  );
}

export function useRecordHandoffNote(reportId: string) {
  return useReportMutation<HandoffNoteInput>(reportId,
    (input) => reportsRepository.recordHandoffNote(reportId, input));
}

export function useLinkDuplicateReport(reportId: string) {
  return useReportMutation<DuplicateLinkInput>(
    reportId,
    (input) => reportsRepository.linkDuplicate(reportId, input),
  );
}

export function useUnlinkDuplicateReport(reportId: string) {
  return useReportMutation<DuplicateUnlinkInput>(
    reportId,
    (input) => reportsRepository.unlinkDuplicate(reportId, input),
  );
}
