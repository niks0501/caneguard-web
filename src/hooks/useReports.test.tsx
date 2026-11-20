import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import type { DiseaseReport } from "../domain/report.types";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportsRepository } from "../services/reports.service";
import { reportDetailDto } from "../test/fixtures";
import { fieldValidationKeys } from "./fieldValidationQueries";
import { dashboardKeys } from "./useDashboard";
import { recordAerialOff, reportKeys } from "./reportQueries";
import { useAddAerialAnalysis, useRecordHandoffNote, useUpdateReportReview } from "./useReports";

vi.mock("../services/reports.service", () => ({
  reportsRepository: {
    updateReview: vi.fn(),
    recordHandoffNote: vi.fn(),
    addAerialAnalysis: vi.fn(),
  },
}));

describe("report mutations", () => {
  it.each(["success", "failure"])("invalidates the case after an aerial upload %s", async (outcome) => {
    const queryClient = createQueryClient();
    const key = reportKeys.detail("r1");
    queryClient.setQueryData(key, { aerialAnalyses: [] });
    const upload = vi.mocked(reportsRepository.addAerialAnalysis);
    if (outcome === "success") upload.mockResolvedValueOnce({} as never);
    else upload.mockRejectedValueOnce(new Error("response lost"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAddAerialAnalysis("r1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(new File(["x"], "field.jpg", { type: "image/jpeg" })).catch(() => undefined);
    });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });
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

  describe("aerial analyses in save responses", () => {
    const reviewInput = {
      status: "verified_by_staff" as const,
      notes: "Reviewed.",
      authorityClassifiedCondition: null,
    };
    const setup = () => {
      const queryClient = createQueryClient();
      const report = mapReportDetail(reportDetailResponseSchema.parse({ data: reportDetailDto }).data);
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      return { queryClient, report, wrapper };
    };

    it("keeps the aerial analyses a review response returns while the check is on", async () => {
      const { queryClient, report, wrapper } = setup();
      const returned = [{ uuid: "a2" }] as never;
      vi.mocked(reportsRepository.updateReview).mockResolvedValue({ ...report, aerialAnalyses: returned });
      const { result } = renderHook(() => useUpdateReportReview(report.uuid), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ ...reviewInput, expectedVersion: report.reviewVersion! });
      });

      expect(queryClient.getQueryData<{ aerialAnalyses?: unknown }>(reportKeys.detail(report.uuid))?.aerialAnalyses).toBe(returned);
    });

    it("clears cached aerial analyses when a review response omits them", async () => {
      const { queryClient, report, wrapper } = setup();
      queryClient.setQueryData(reportKeys.detail(report.uuid), { ...report, aerialAnalyses: [{ uuid: "a1" }] as never });
      vi.mocked(reportsRepository.updateReview).mockResolvedValue({ ...report, aerialAnalyses: undefined });
      const { result } = renderHook(() => useUpdateReportReview(report.uuid), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ ...reviewInput, expectedVersion: report.reviewVersion! });
      });

      expect(queryClient.getQueryData<{ aerialAnalyses?: unknown }>(reportKeys.detail(report.uuid))?.aerialAnalyses).toBeUndefined();
    });

    it("keeps aerial analyses from a save sent after an Off that the client already observed", async () => {
      const { queryClient, report, wrapper } = setup();
      const returned = [{ uuid: "a4" }] as never;
      recordAerialOff();
      vi.mocked(reportsRepository.updateReview).mockResolvedValue({ ...report, aerialAnalyses: returned });
      const { result } = renderHook(() => useUpdateReportReview(report.uuid), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ ...reviewInput, expectedVersion: report.reviewVersion! });
      });

      expect(queryClient.getQueryData<{ aerialAnalyses?: unknown }>(reportKeys.detail(report.uuid))?.aerialAnalyses).toBe(returned);
    });

    it("keeps aerial analyses from a save during which the check was only turned on", async () => {
      const { queryClient, report, wrapper } = setup();
      const returned = [{ uuid: "a5" }] as never;
      let finishSave: (saved: DiseaseReport) => void = () => undefined;
      vi.mocked(reportsRepository.updateReview).mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
      const { result } = renderHook(() => useUpdateReportReview(report.uuid), { wrapper });

      const pending = result.current.mutateAsync({ ...reviewInput, expectedVersion: report.reviewVersion! });
      await vi.waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalled());
      finishSave({ ...report, aerialAnalyses: returned });
      await act(async () => {
        await pending;
      });

      expect(queryClient.getQueryData<{ aerialAnalyses?: unknown }>(reportKeys.detail(report.uuid))?.aerialAnalyses).toBe(returned);
    });

    it("discards aerial analyses from a save overtaken by an observed Off", async () => {
      const { queryClient, report, wrapper } = setup();
      let finishSave: (saved: DiseaseReport) => void = () => undefined;
      vi.mocked(reportsRepository.updateReview).mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
      const { result } = renderHook(() => useUpdateReportReview(report.uuid), { wrapper });

      const pending = result.current.mutateAsync({ ...reviewInput, expectedVersion: report.reviewVersion! });
      await vi.waitFor(() => expect(reportsRepository.updateReview).toHaveBeenCalled());
      recordAerialOff();
      finishSave({ ...report, aerialAnalyses: [{ uuid: "a3" }] as never });
      await act(async () => {
        await pending;
      });

      expect(queryClient.getQueryData<{ aerialAnalyses?: unknown }>(reportKeys.detail(report.uuid))?.aerialAnalyses).toBeUndefined();
      expect(queryClient.getQueryState(reportKeys.detail(report.uuid))?.isInvalidated).toBe(true);
    });
  });
});
