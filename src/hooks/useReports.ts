import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportFilters } from "../domain/report.types";
import type { ReportReviewInput } from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
  reportKeys,
  reportQueryOptions,
  reportsQueryOptions,
} from "./reportQueries";
import { dashboardKeys } from "./useDashboard";

export function useReports(
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery(reportsQueryOptions(filters, options));
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
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: reportKeys.detail(reportId),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      ]);
    },
  });
}
