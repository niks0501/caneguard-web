import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportsRepository } from "../services/reports.service";
import { reportDetailDto } from "../test/fixtures";
import { fieldValidationKeys } from "./fieldValidationQueries";
import { dashboardKeys } from "./useDashboard";
import { reportKeys } from "./reportQueries";
import { useRecordHandoffNote, useUpdateReportReview } from "./useReports";

vi.mock("../services/reports.service", () => ({
  reportsRepository: {
    updateReview: vi.fn(),
    recordHandoffNote: vi.fn(),
  },
}));

describe("report mutations", () => {
  it("caches the version returned by a plain handoff save", async () => {
    const queryClient = createQueryClient();
    const report = mapReportDetail(reportDetailResponseSchema.parse({
      data: { ...reportDetailDto, version: reportDetailDto.version + 1 },
    }).data);
    vi.mocked(reportsRepository.recordHandoffNote).mockResolvedValue(report);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRecordHandoffNote(report.uuid), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ destination: "Offline validator", sentDate: "2026-10-04", expectedVersion: reportDetailDto.version });
    });
    expect(queryClient.getQueryData(reportKeys.detail(report.uuid))).toEqual(report);
    expect(reportsRepository.recordHandoffNote).toHaveBeenCalledWith(report.uuid, {
      destination: "Offline validator", sentDate: "2026-10-04", expectedVersion: reportDetailDto.version,
    });
  });

  it("updates detail and invalidates all report-dependent queries after success", async () => {
    const queryClient = createQueryClient();
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
    );
    vi.mocked(reportsRepository.updateReview).mockResolvedValue(report);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => useUpdateReportReview(report.uuid),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({
        status: "verified_by_staff",
        notes: "Reviewed.",
        authorityClassifiedCondition: null,
        expectedVersion: report.reviewVersion!,
      });
    });

    expect(queryClient.getQueryData(reportKeys.detail(report.uuid))).toEqual(
      report,
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: reportKeys.detail(report.uuid),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: reportKeys.lists(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dashboardKeys.all,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: fieldValidationKeys.all,
    });
  });
});
