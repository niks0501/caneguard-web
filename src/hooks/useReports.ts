import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Advisory,
  AdvisoryInput,
  AdvisoryUpdateInput,
  DiseaseReport,
  ReportFilters,
} from "../domain/report.types";
import type { UpdateAffectedFieldsInput } from "../domain/fieldSurvey.types";
import type {
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ReportReviewInput,
  HandoffNoteInput,
} from "../domain/review.types";
import { reportsRepository } from "../services/reports.service";
import {
  advisoriesQueryOptions,
  aerialOffReadCount,
  caseReadsInFlight,
  caseReadsStartedCount,
  monthlySummaryQueryOptions,
  possibleRecentMatchesQueryOptions,
  reportKeys,
  reportQueryOptions,
  reportQueueReadQueryOptions,
  reportsQueryOptions,
} from "./reportQueries";
import { invalidateReportDependentQueries } from "./reportInvalidation";

export function useMonthlyReportSummary(month?: string) {
  return useQuery(monthlySummaryQueryOptions(month));
}

export function useAdvisories() {
  return useQuery(advisoriesQueryOptions());
}

/** Farmer-request replies and barangay broadcasts read the library under their own key. */
const farmerAdvisoriesKey = ["farmer-inquiries", "advisories"] as const;

/**
 * Patch the cached library with the server's answer so the picker can select a new advisory
 * at once, then refetch every list that shows advisories.
 */
function useAdvisoryLibraryMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  patch: (list: Advisory[], result: TResult, input: TInput) => Advisory[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (result, input) => {
      queryClient.setQueryData<Advisory[]>(
        reportKeys.advisories(),
        (list) => (list ? patch(list, result, input) : list),
      );
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: reportKeys.advisories() }),
        queryClient.invalidateQueries({ queryKey: farmerAdvisoriesKey }),
      ]);
    },
  });
}

export function useCreateAdvisory() {
  return useAdvisoryLibraryMutation(
    (input: AdvisoryInput) => reportsRepository.createAdvisory(input),
    (list, created) => [...list, created],
  );
}

export function useUpdateAdvisory() {
  return useAdvisoryLibraryMutation(
    (input: { advisoryUuid: string; changes: AdvisoryUpdateInput }) =>
      reportsRepository.updateAdvisory(input.advisoryUuid, input.changes),
    (list, updated) => list.map((item) => (item.uuid === updated.uuid ? updated : item)),
  );
}

export function useDeleteAdvisory() {
  return useAdvisoryLibraryMutation(
    (advisoryUuid: string) => reportsRepository.deleteAdvisory(advisoryUuid),
    (list, result) => list.filter((item) => item.uuid !== result.uuid),
  );
}

export function useReports(
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery(reportsQueryOptions(filters, options));
}

/**
 * Complete bounded queue read: every matching page up to a hard cap, with the
 * server's authoritative total and an explicit truncation flag.
 */
export function useReportsQueue(
  filters: ReportFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery(reportQueueReadQueryOptions(filters, options));
}

export function useExportReports() {
  return useMutation({
    mutationFn: (filters: ReportFilters) => reportsRepository.exportReports(filters),
  });
}

export function useReport(reportId: string) {
  return useQuery(reportQueryOptions(reportId));
}

/**
 * Opening a case stamps the first-reviewed signal through the dedicated
 * idempotent endpoint (Q8). The stamp never bumps `lock_version`, so the
 * cached detail keeps the version the reviewer already loaded. Queue status and
 * first-reviewed reporting are reconciled on success, but only when the server
 * acknowledges the stamp.
 */
export function useOpenCase(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => reportsRepository.openCase(reportId),
    onSuccess: async ({ firstReviewedAt }) => {
      queryClient.setQueryData<DiseaseReport | null>(
        reportKeys.detail(reportId),
        (current) =>
          current
            ? { ...current, firstReviewedAt: firstReviewedAt ?? current.firstReviewedAt }
            : current,
      );
      // The detail stays as loaded; only dependent queues/reporting re-read.
      await invalidateReportDependentQueries(queryClient);
    },
  });
}

function useReportMutation<TInput>(
  reportId: string,
  mutationFn: (input: TInput) => Promise<DiseaseReport>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: () => ({ reads: caseReadsStartedCount(), offs: aerialOffReadCount() }),
    onSuccess: async (report, _input, sentAt) => {
      const overlapped = caseReadsStartedCount() !== sentAt.reads
        || caseReadsInFlight() > 0
        || aerialOffReadCount() !== sentAt.offs;
      if (overlapped) {
        await queryClient.cancelQueries({ queryKey: reportKeys.detail(reportId), exact: true });
        queryClient.setQueryData<DiseaseReport | null>(
          reportKeys.detail(reportId),
          (current) => current && { ...current, aerialAnalyses: undefined },
        );
        await queryClient.fetchQuery({ ...reportQueryOptions(reportId), staleTime: 0 }).catch(() => undefined);
      } else {
        queryClient.setQueryData<DiseaseReport>(reportKeys.detail(reportId), report);
      }
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

export function useUpdateReportAffectedFields(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAffectedFieldsInput) =>
      reportsRepository.updateAffectedFields(reportId, input),
    onSuccess: async (result) => {
      queryClient.setQueryData<DiseaseReport | null>(
        reportKeys.detail(reportId),
        (current) => current
          ? {
              ...current,
              affectedFields: result.affectedFields,
              reviewVersion: result.version,
              updatedAt: result.updatedAt,
            }
          : current,
      );
      await invalidateReportDependentQueries(queryClient, { reportId });
    },
  });
}

/** Experimental aerial check: one upload, answered after the server ran the model. */
export function useAddAerialAnalysis(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (image: File) => reportsRepository.addAerialAnalysis(reportId, image),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reportKeys.detail(reportId) }),
  });
}

export function useRemoveAerialAnalysis(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (analysisUuid: string) =>
      reportsRepository.removeAerialAnalysis(reportId, analysisUuid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportKeys.detail(reportId) }),
  });
}

export function useRestoreAerialAnalysis(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { analysisUuid: string; removalId: string }) =>
      reportsRepository.restoreAerialAnalysis(reportId, input.analysisUuid, input.removalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportKeys.detail(reportId) }),
  });
}

export function useAerialMask(maskUrl: string) {
  return useQuery({
    queryKey: ["aerial-mask", maskUrl],
    queryFn: () => reportsRepository.getAerialMask(maskUrl),
    staleTime: Infinity,
    retry: false,
  });
}
