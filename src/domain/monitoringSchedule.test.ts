import { describe, expect, it } from "vitest";
import type { FieldValidationQueueItem } from "./fieldValidation.types";
import {
  addScheduleDays,
  compareDayAgenda,
  groupScheduleByDate,
  isScheduleDateKey,
  isScheduleMonthKey,
  scheduleDateLabel,
  scheduleMonthGrid,
  scheduleMonthLabel,
  scheduleMonthOf,
  shiftScheduleMonth,
  summarizeActiveWorkload,
} from "./monitoringSchedule";

function visit(overrides: Partial<FieldValidationQueueItem> & { uuid: string }): FieldValidationQueueItem {
  return {
    referenceCode: overrides.uuid.toUpperCase(),
    barangay: "Balaytigui",
    province: "Batangas",
    municipality: "Nasugbu",
    observedAt: "2026-09-01T01:00:00.000Z",
    submittedAt: "2026-09-01T02:00:00.000Z",
    predictedDisease: "rust",
    confidence: 0.84,
    reviewStatus: "for_field_validation",
    targetVisitDate: null,
    assignee: null,
    finalLatitude: null,
    finalLongitude: null,
    locationSource: null,
    gpsAccuracy: null,
    affectedAreaHectares: null,
    affectedPortionPercent: null,
    ...overrides,
  };
}

describe("monitoring schedule keys", () => {
  it("validates real date and month keys only", () => {
    expect(isScheduleDateKey("2026-10-07")).toBe(true);
    expect(isScheduleDateKey("2026-02-30")).toBe(false);
    expect(isScheduleDateKey("2026-2-07")).toBe(false);
    expect(isScheduleMonthKey("2026-10")).toBe(true);
    expect(isScheduleMonthKey("2026-13")).toBe(false);
    expect(scheduleMonthOf("2026-10-07")).toBe("2026-10");
  });

  it("adds days and shifts months without timezone drift", () => {
    expect(addScheduleDays("2026-10-07", 7)).toBe("2026-10-14");
    expect(addScheduleDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftScheduleMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftScheduleMonth("2026-12", 1)).toBe("2027-01");
  });

  it("labels the office month and date", () => {
    expect(scheduleMonthLabel("2026-10")).toBe("October 2026");
    expect(scheduleDateLabel("2026-10-07")).toBe("October 7, 2026");
  });

  it("builds a Monday-first grid with inactive adjacent-month fillers", () => {
    const grid = scheduleMonthGrid("2026-10");
    expect(grid).toHaveLength(35);
    expect(grid[0]).toMatchObject({ key: "2026-09-28", inMonth: false });
    expect(grid[3]).toMatchObject({ key: "2026-10-01", dayNumber: 1, inMonth: true });
    expect(grid[grid.length - 1]).toMatchObject({ key: "2026-11-01", inMonth: false });
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31);
  });
});

describe("global active-work summary", () => {
  const officeDate = "2026-10-07";

  it("splits active work into Overdue, Today, Next 7 days, and Unscheduled", () => {
    const items = [
      visit({ uuid: "overdue", targetVisitDate: "2026-10-06" }),
      visit({ uuid: "today", targetVisitDate: "2026-10-07" }),
      visit({ uuid: "tomorrow", targetVisitDate: "2026-10-08" }),
      visit({ uuid: "last-of-window", targetVisitDate: "2026-10-14" }),
      visit({ uuid: "beyond-window", targetVisitDate: "2026-10-15" }),
      visit({ uuid: "undated", targetVisitDate: null }),
    ];

    expect(summarizeActiveWorkload(items, officeDate)).toEqual({
      overdue: 1,
      today: 1,
      next7Days: 2,
      unscheduled: 1,
    });
  });

  it("never counts Today as Overdue and never counts beyond the window", () => {
    const counts = summarizeActiveWorkload(
      [
        visit({ uuid: "today", targetVisitDate: officeDate }),
        visit({ uuid: "far", targetVisitDate: "2026-11-01" }),
      ],
      officeDate,
    );
    expect(counts.overdue).toBe(0);
    expect(counts.today).toBe(1);
    expect(counts.next7Days).toBe(0);
  });
});

describe("same-date agenda ordering", () => {
  it("orders known observations oldest first, null observations last, then submitted time and identity", () => {
    const items = [
      visit({ uuid: "z-case", observedAt: "2026-09-10T01:00:00.000Z", submittedAt: "2026-09-10T03:00:00.000Z" }),
      visit({ uuid: "b-case", observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T03:00:00.000Z" }),
      visit({ uuid: "a-null", observedAt: null, submittedAt: "2026-08-01T03:00:00.000Z" }),
      visit({ uuid: "c-case", observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T02:00:00.000Z" }),
      visit({ uuid: "a-case", observedAt: "2026-09-01T01:00:00.000Z", submittedAt: "2026-09-01T02:00:00.000Z" }),
    ];

    expect([...items].sort(compareDayAgenda).map((item) => item.uuid)).toEqual([
      "a-case",
      "c-case",
      "b-case",
      "z-case",
      "a-null",
    ]);
  });

  it("groups dated work and keeps undated work out of dated cells", () => {
    const grouped = groupScheduleByDate([
      visit({ uuid: "later", targetVisitDate: "2026-10-08" }),
      visit({ uuid: "earlier", targetVisitDate: "2026-10-07" }),
      visit({ uuid: "undated", targetVisitDate: null }),
    ]);

    expect([...grouped.keys()]).toEqual(["2026-10-08", "2026-10-07"]);
    expect(grouped.get("2026-10-07")?.map((item) => item.uuid)).toEqual(["earlier"]);
    expect(grouped.get("2026-10-08")?.map((item) => item.uuid)).toEqual(["later"]);
  });
});
