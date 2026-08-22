import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../app/queryClient";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

describe("getOperationalQueryRefreshOptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults API-backed operational queries to a ten-minute cadence", () => {
    expect(getOperationalQueryRefreshOptions("api").refetchInterval).toBe(600_000);
  });

  it("polls API-backed operational queries at the configured interval", () => {
    expect(getOperationalQueryRefreshOptions("api", 30_000)).toEqual({
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });
  });

  it("does not poll mock data", () => {
    expect(getOperationalQueryRefreshOptions("mock", 30_000)).toEqual({
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });
  });

  it("refetches changing API data without remounting the observer", async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    const queryClient = createQueryClient();
    const observer = new QueryObserver(queryClient, {
      queryKey: ["operational-test"],
      queryFn,
      ...getOperationalQueryRefreshOptions("api", 30_000),
    });
    let unsubscribe: (() => void) | undefined;

    try {
      const firstSuccess = new Promise<void>((resolve) => {
        unsubscribe = observer.subscribe((result) => {
          if (result.isSuccess) resolve();
        });
      });
      await firstSuccess;
      expect(observer.getCurrentResult().data).toBe("first");

      await vi.advanceTimersByTimeAsync(30_000);

      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(observer.getCurrentResult().data).toBe("second");
    } finally {
      unsubscribe?.();
      queryClient.clear();
    }
  });

  it("keeps cached data when an API refresh fails", async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce("first")
      .mockRejectedValueOnce(new Error("offline"));
    const queryClient = createQueryClient();
    const observer = new QueryObserver(queryClient, {
      queryKey: ["operational-failure-test"],
      queryFn,
      ...getOperationalQueryRefreshOptions("api", 30_000),
    });
    let unsubscribe: (() => void) | undefined;

    try {
      const firstSuccess = new Promise<void>((resolve) => {
        unsubscribe = observer.subscribe((result) => {
          if (result.isSuccess) resolve();
        });
      });
      await firstSuccess;

      await vi.advanceTimersByTimeAsync(30_000);

      const result = observer.getCurrentResult();
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(result.isRefetchError).toBe(true);
      expect(result.data).toBe("first");
    } finally {
      unsubscribe?.();
      queryClient.clear();
    }
  });
});
