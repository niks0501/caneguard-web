import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiseaseReport, ReportFilters } from "../domain/report.types";
import type {
  ExpertReferralResponseInput,
  ReportReferralInput,
  ReportReviewInput,
} from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
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

export function useUpdateReportReview(reportId: string) {
  return useReportMutation<ReportReviewInput>(
    reportId,
    (input) => reportsRepository.updateReview(reportId, input),
  );
}

export function useRecordReportReferral(reportId: string) {
  return useReportMutation<ReportReferralInput>(
    reportId,
    (input) => reportsRepository.recordReferral(reportId, input),
  );
}

export function useRecordExpertReferralResponse(reportId: string) {
  return useReportMutation<ExpertReferralResponseInput>(
    reportId,
    (input) => reportsRepository.recordExpertReferralResponse(reportId, input),
  );
}
