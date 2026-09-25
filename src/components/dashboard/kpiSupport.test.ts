import { describe, expect, it } from "vitest";
import {
  COMPARISON_UNAVAILABLE,
  NOTHING_WAITING,
  OLDEST_WAIT_UNAVAILABLE,
  WAITING_AGE_UNAVAILABLE,
  deltaSupportLine,
  noActiveWorkGraphicName,
  pastTargetDateSupportLine,
  waitingAgeSupportLine,
} from "./kpiSupport";

describe("KPI supporting lines", () => {
  it("prints a signed delta against the comparison window", () => {
    expect(deltaSupportLine(3, false)).toBe("+3 vs previous period");
    expect(deltaSupportLine(-3, false)).toBe("-3 vs previous period");
    expect(deltaSupportLine(0, false)).toBe("No change vs previous period");
  });

  it("labels a window that stops at today as month to date", () => {
    expect(deltaSupportLine(3, true)).toBe(
      "+3 vs previous period · month to date",
    );
    expect(deltaSupportLine(0, true)).toBe(
      "No change vs previous period · month to date",
    );
  });

  it("reports the oldest wait from the same backlog the card counts", () => {
    expect(
      waitingAgeSupportLine({
        totalWaiting: 4,
        buckets: [],
        oldestWaitingDays: 14,
      }),
    ).toBe("Oldest: 14 days");
    expect(
      waitingAgeSupportLine({
        totalWaiting: 1,
        buckets: [],
        oldestWaitingDays: 1,
      }),
    ).toBe("Oldest: 1 day");
  });

  it("separates an empty backlog from an unmeasurable oldest wait", () => {
    // Nothing waiting has no oldest age: it is not a zero-day wait.
    expect(
      waitingAgeSupportLine({
        totalWaiting: 0,
        buckets: [],
        oldestWaitingDays: null,
      }),
    ).toBe(NOTHING_WAITING);
    // Records counted without a usable submission timestamp stay unmeasured.
    expect(
      waitingAgeSupportLine({
        totalWaiting: 2,
        buckets: [],
        oldestWaitingDays: null,
      }),
    ).toBe(OLDEST_WAIT_UNAVAILABLE);
    // No backlog at all is unavailable, never zero.
    expect(waitingAgeSupportLine(undefined)).toBe(WAITING_AGE_UNAVAILABLE);
  });

  it("names the field-validation past-target subset inside its queue count", () => {
    expect(pastTargetDateSupportLine(4)).toBe("4 past target date");
    expect(pastTargetDateSupportLine(0)).toBe("0 past target date");
  });

  it("names the status indicator with the count it encodes", () => {
    expect(noActiveWorkGraphicName(1)).toBe(
      "1 unverified report with no validation or referral underway",
    );
    expect(noActiveWorkGraphicName(6)).toBe(
      "6 unverified reports with no validation or referral underway",
    );
    expect(COMPARISON_UNAVAILABLE).toBe("Previous period unavailable");
  });
});
