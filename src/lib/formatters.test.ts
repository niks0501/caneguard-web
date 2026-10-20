import { describe, expect, it } from "vitest";
import {
  MANILA_TIME_ZONE,
  formatClockTime,
  formatClockTimeWithSeconds,
  formatDateTime,
  formatAreaSqm,
} from "./formatters";

/**
 * The captain's rule: every displayed time is 12-hour with an explicit
 * ante/post meridiem marker, in Asia/Manila wall time. A bare "21:14" must
 * be impossible to produce from these helpers.
 */
const TWENTY_FOUR_HOUR = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?!:)\b(?!\s*[AP]\.?M)/i;

describe("field-survey area formatting", () => {
  it("formats device-reported square metres and hectares without changing the source value", () => {
    expect(formatAreaSqm(6075.123)).toBe("6,075 m² · 0.61 ha");
    expect(formatAreaSqm(10_000)).toBe("10,000 m² · 1 ha");
    expect(formatAreaSqm(-1)).toBe("—");
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
