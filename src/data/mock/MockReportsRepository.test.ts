import { afterEach, describe, expect, it, vi } from "vitest";
import { MockReportsRepository } from "./MockReportsRepository";

afterEach(() => {
  vi.useRealTimers();
});

describe("mock monthly reporting periods", () => {
  it("uses the Manila calendar month and its actual final date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));

    const summary = await new MockReportsRepository().getMonthlySummary();

    expect(summary.month).toBe("2026-10");
    expect(summary.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("returns the last calendar day for a leap-year February", async () => {
    const summary = await new MockReportsRepository().getMonthlySummary("2024-02");

    expect(summary.period).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});
