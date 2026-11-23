import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { reportsRepository } from "../services/reports.service";
import { reportKeys } from "./reportQueries";
import { REVIEW_CLAIM_HEARTBEAT_MS, useReviewClaim } from "./useReviewClaim";

vi.mock("../services/reports.service", () => ({
  reportsRepository: {
    claimReview: vi.fn(),
    releaseReview: vi.fn(),
  },
}));

function setup(reportId: string | undefined = "r1", enabled = true) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(reportKeys.detail("r1"), { uuid: "r1" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useReviewClaim(reportId, enabled), { wrapper }) };
}

describe("useReviewClaim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(reportsRepository.claimReview).mockReset().mockResolvedValue(true);
    vi.mocked(reportsRepository.releaseReview).mockReset().mockResolvedValue();
  });
  afterEach(() => vi.useRealTimers());

  it("claims on open, renews on the heartbeat, and releases on leave", async () => {
    const { unmount } = setup();
    await act(async () => {});
    expect(reportsRepository.claimReview).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(REVIEW_CLAIM_HEARTBEAT_MS); });
    expect(reportsRepository.claimReview).toHaveBeenCalledTimes(2);

    unmount();
    expect(reportsRepository.releaseReview).toHaveBeenCalledWith("r1");
  });

  it("goes read-only and re-reads the case when another reviewer holds it", async () => {
    vi.mocked(reportsRepository.claimReview).mockResolvedValue(false);
    const { result, queryClient, unmount } = setup();
    await act(async () => {});

    expect(result.current.refused).toBe(true);
    expect(queryClient.getQueryState(reportKeys.detail("r1"))?.isInvalidated).toBe(true);
    unmount();
    // Never release a lease this session does not hold.
    expect(reportsRepository.releaseReview).not.toHaveBeenCalled();
  });

  it("recovers the case when the holder lets go", async () => {
    vi.mocked(reportsRepository.claimReview).mockResolvedValueOnce(false);
    const { result } = setup();
    await act(async () => {});
    expect(result.current.refused).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(REVIEW_CLAIM_HEARTBEAT_MS); });
    expect(result.current.refused).toBe(false);
  });

  it("keeps working through a failed heartbeat", async () => {
    vi.mocked(reportsRepository.claimReview).mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await act(async () => {});
    expect(result.current.refused).toBe(false);
  });

  it("steps away with a note and does not release a second time on leave", async () => {
    const { result, unmount } = setup();
    await act(async () => {});

    await act(async () => { await result.current.release("Pick up at the advisory."); });
    expect(reportsRepository.releaseReview).toHaveBeenCalledWith("r1", "Pick up at the advisory.");

    unmount();
    expect(reportsRepository.releaseReview).toHaveBeenCalledTimes(1);
  });

  it("does nothing until enabled", async () => {
    setup("r1", false);
    await act(async () => {});
    expect(reportsRepository.claimReview).not.toHaveBeenCalled();
  });
});
