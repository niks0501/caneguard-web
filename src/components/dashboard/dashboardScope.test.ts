import { describe, expect, it } from "vitest";
import {
  dateDifferenceInDays,
  formatAsOfTime,
  formatWindow,
  monthBounds,
  resolveScope,
  shiftDateString,
} from "./dashboardScope";

describe("dashboardScope", () => {
  it("resolves the month scope to PHT calendar bounds with day buckets", () => {
    expect(resolveScope({ mode: "month", month: "2026-09", from: "", to: "" })).toEqual({
      mode: "month",
      month: "2026-09",
      from: "2026-09-01",
      to: "2026-09-30",
      granularity: "day",
    });
    expect(monthBounds("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("resolves the last-30-days scope ending today", () => {
    expect(
      resolveScope(
        { mode: "last30", month: "2026-09", from: "", to: "" },
        "2026-09-24",
      ),
    ).toEqual({
      mode: "last30",
      month: "2026-09",
      from: "2026-08-26",
      to: "2026-09-24",
      granularity: "day",
    });
  });

  it("resolves custom ranges and switches to week buckets past 62 days", () => {
    expect(
      resolveScope({
        mode: "custom",
        month: "",
        from: "2026-09-01",
        to: "2026-09-24",
      }),
    ).toMatchObject({ from: "2026-09-01", to: "2026-09-24", granularity: "day" });
    expect(
      resolveScope({
        mode: "custom",
        month: "",
        from: "2026-01-01",
        to: "2026-09-24",
      }),
    ).toMatchObject({ granularity: "week", month: "2026-09" });
  });

  it("normalises a reversed custom range", () => {
    expect(
      resolveScope({
        mode: "custom",
        month: "",
        from: "2026-09-24",
        to: "2026-09-01",
      }),
    ).toMatchObject({ from: "2026-09-01", to: "2026-09-24" });
  });

  it("formats windows without inventing comparability", () => {
    expect(formatWindow("2026-09-01", "2026-09-24")).toBe("1–24 Sep 2026");
    expect(formatWindow("2026-08-08", "2026-08-31")).toBe("8–31 Aug 2026");
    expect(formatWindow("2026-08-26", "2026-09-24")).toBe("26 Aug – 24 Sep 2026");
    expect(dateDifferenceInDays("2026-09-01", "2026-09-24")).toBe(23);
    expect(shiftDateString("2026-09-24", -29)).toBe("2026-08-26");
  });

  it("stamps freshness as 12-hour Asia/Manila wall time with a meridiem marker", () => {
    // 13:14 UTC is 21:14 in Asia/Manila: shown as 9:14 PM, never 24-hour.
    expect(formatAsOfTime(new Date("2026-09-24T13:14:03Z").getTime())).toBe(
      "9:14:03 PM",
    );
    expect(formatAsOfTime(new Date("2026-09-24T01:05:00Z").getTime())).toBe(
      "9:05:00 AM",
    );
    expect(formatAsOfTime(0)).toBe("Not refreshed yet");
  });
});
