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
    expect(analytics.casesByBarangay.reduce((total, item) => total + item.reportedCases, 0)).toBe(8);
    expect(analytics.casesByPossibleCondition.reduce((total, item) => total + item.reportedCases, 0)).toBe(8);
    expect(analytics.comparison.currentTotal).toBe(8);
    expect(analytics.period.days).toBe(31);
  });

  it("uses the current Asia/Manila month for a default summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T16:30:00.000Z"));

    const summary = await new MockDashboardRepository().getSummary();

    expect(summary.monthlySummary?.month).toBe("2026-09");
  });
});
