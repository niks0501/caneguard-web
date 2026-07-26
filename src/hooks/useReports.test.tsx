import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { mapReportDetail } from "../data/api/mappers/report.mapper";
import { reportDetailResponseSchema } from "../data/api/schemas/report.schema";
import { reportsRepository } from "../services/reports.service";
import { reportDetailDto } from "../test/fixtures";
import { dashboardKeys } from "./useDashboard";
import { reportKeys } from "./reportQueries";
import { useUpdateReportReview } from "./useReports";

vi.mock("../services/reports.service", () => ({
  reportsRepository: {
    updateReview: vi.fn(),
  },
}));

describe("useUpdateReportReview", () => {
  it("updates detail and invalidates report lists and dashboard after success", async () => {
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
  });
});
