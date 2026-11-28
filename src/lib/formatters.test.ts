import { describe, expect, it } from "vitest";
import {
  MANILA_TIME_ZONE,
  formatClockTime,
  formatClockTimeWithSeconds,
  formatDateTime,
  formatAffectedArea,
  formatAreaHectares,
  formatMeasuredArea,
  formatMeasuredPercent,
} from "./formatters";

/**
 * The captain's rule: every displayed time is 12-hour with an explicit
 * ante/post meridiem marker, in Asia/Manila wall time. A bare "21:14" must
 * be impossible to produce from these helpers.
 */
const TWENTY_FOUR_HOUR = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?!:)\b(?!\s*[AP]\.?M)/i;

describe("area and measurement formatting", () => {
  it("formats generic areas with two decimals for ordinary values and preserves small-patch precision", () => {
    expect(formatAreaHectares(1.2)).toBe("1.2 ha");
    expect(formatAreaHectares(0.3)).toBe("0.3 ha");
    expect(formatAreaHectares(0.6075123)).toBe("0.61 ha");
    expect(formatAreaHectares(1)).toBe("1 ha");
    expect(formatAreaHectares(2.4)).toBe("2.4 ha");
    expect(formatAreaHectares(0.015)).toBe("0.02 ha");
    expect(formatAreaHectares(0)).toBe("0 ha");
    expect(formatAreaHectares(40 / 10_000)).toBe("0.004 ha");
    expect(formatAreaHectares(49 / 10_000)).toBe("0.0049 ha");
    expect(formatAreaHectares(50 / 10_000)).toBe("0.005 ha");
    expect(formatAreaHectares(95 / 10_000)).toBe("0.0095 ha");
    expect(formatAreaHectares(0.4 / 10_000)).toBe("0.00004 ha");
    expect(formatAreaHectares(Number.MIN_VALUE)).not.toBe("0 ha");
    expect(formatAreaHectares(null)).toBe("—");
    expect(formatAreaHectares(undefined)).toBe("—");
  });

  it("distinguishes unmeasured from confirmed zero and positive areas in formatMeasuredArea", () => {
    expect(formatMeasuredArea(null, "not_measured")).toBe("Not measured");
    expect(formatMeasuredArea(0, "not_measured")).toBe("Not measured");
    expect(formatMeasuredArea(1.2, "not_measured")).toBe("Not measured");
    expect(formatMeasuredArea(null, "measured")).toBe("Not measured");
    expect(formatMeasuredArea(0, "measured")).toBe("0 ha");
    expect(formatMeasuredArea(0.004, "measured")).toBe("0.004 ha");
    expect(formatMeasuredArea(0.3, "measured")).toBe("0.3 ha");
    expect(formatMeasuredArea(null, "not_measured", { unmeasuredLabel: "—" })).toBe("—");
  });

  it("distinguishes unmeasured from confirmed zero in formatMeasuredPercent", () => {
    expect(formatMeasuredPercent(null, "not_measured")).toBe("Not measured");
    expect(formatMeasuredPercent(0, "not_measured")).toBe("Not measured");
    expect(formatMeasuredPercent(25, "not_measured")).toBe("Not measured");
    expect(formatMeasuredPercent(0, "measured")).toBe("0%");
    expect(formatMeasuredPercent(25, "measured")).toBe("25%");
    expect(formatMeasuredPercent(42.75, "measured")).toBe("42.75%");
  });

  it("keeps formatAffectedArea compact for table cells without rounding tiny patches to zero", () => {
    expect(formatAffectedArea(0.6075123)).toBe("0.61 ha");
    expect(formatAffectedArea(1)).toBe("1 ha");
    expect(formatAffectedArea(2.4)).toBe("2.4 ha");
    expect(formatAffectedArea(0.015)).toBe("0.02 ha");
    expect(formatAffectedArea(49 / 10_000)).toBe("0.0049 ha");
    expect(formatAffectedArea(0.4 / 10_000)).toBe("0.00004 ha");
    expect(formatAffectedArea(Number.MIN_VALUE)).not.toBe("0 ha");
    expect(formatAffectedArea(0, "measured")).toBe("0 ha");
    expect(formatAffectedArea(0, "not_measured")).toBe("—");
  });
});

describe("12-hour operational time formatting", () => {
  it("declares Asia/Manila as the single operational time zone", () => {
    expect(MANILA_TIME_ZONE).toBe("Asia/Manila");
  });

  it("formats clock times with an explicit meridiem marker", () => {
    // 13:14 UTC is 21:14 Asia/Manila.
    expect(formatClockTime("2026-09-24T13:14:00Z")).toBe("9:14 PM");
    expect(formatClockTimeWithSeconds("2026-09-24T13:14:03Z")).toBe("9:14:03 PM");
    // 21:14 local-looking input is still interpreted as the instant and
    // rendered in 12-hour Asia/Manila form.
    expect(formatClockTime("2026-09-24T01:05:00Z")).toBe("9:05 AM");
  });

  it("formats date-times as 12-hour Asia/Manila, never 24-hour", () => {
    const formatted = formatDateTime("2026-09-24T13:14:03Z");
    expect(formatted).toBe("Sep 24, 2026, 9:14 PM");
    expect(formatted).toMatch(/[AP]M$/);
    expect(formatted).not.toMatch(TWENTY_FOUR_HOUR);
  });

  it("holds the 12-hour contract across midnight and noon boundaries", () => {
    // Midnight and noon are the classic 12-hour edge cases.
    expect(formatClockTime("2026-09-24T16:00:00Z")).toBe("12:00 AM");
    expect(formatClockTime("2026-09-24T04:00:00Z")).toBe("12:00 PM");
    for (const instant of [
      "2026-09-24T16:00:00Z",
      "2026-09-24T04:00:00Z",
      "2026-09-24T13:14:00Z",
      "2026-09-24T01:05:00Z",
    ]) {
      expect(formatClockTime(instant)).toMatch(/\d:\d{2}\s?(?:AM|PM)/i);
      expect(formatClockTime(instant)).not.toMatch(TWENTY_FOUR_HOUR);
    }
  });
});
