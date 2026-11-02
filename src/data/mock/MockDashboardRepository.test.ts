import { afterEach, describe, expect, it, vi } from "vitest";
import { MockDashboardRepository } from "./MockDashboardRepository";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MockDashboardRepository", () => {
  it("derives report analytics from the submitted mock reports", async () => {
    const analytics = await new MockDashboardRepository().getAnalytics({
      from: "2026-07-01",
      to: "2026-07-31",
      granularity: "day",
    });

    expect(analytics.totalSubmitted).toBe(8);
    expect(analytics.series.reduce((total, point) => total + point.count, 0)).toBe(8);
    expect(analytics.reviewBacklog.targetDays).toBe(3);
    expect(analytics.validationTurnaround.targetDays).toBe(7);
    expect(analytics.reviewTime.targetDays).toBe(3);
    expect(analytics.comparison.currentTotal).toBe(8);
    expect(analytics.period.days).toBe(31);
  });
});
