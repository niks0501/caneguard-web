import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportFilters } from "../domain/report.types";
import type { ReportReviewInput } from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
  reportKeys,
  reportQueryOptions,
  reportsQueryOptions,
} from "./reportQueries";

export function useReports(filters: ReportFilters = {}) {
  return useQuery(reportsQueryOptions(filters));
}

export function useReport(reportId: string) {
  return useQuery(reportQueryOptions(reportId));
}

export function useUpdateReportReview(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReportReviewInput) =>
      reportsRepository.updateReview(reportId, input),
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.detail(reportId), report);
      return queryClient.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}
