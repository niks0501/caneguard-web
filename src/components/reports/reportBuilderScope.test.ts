import { describe, expect, it } from "vitest";
import { printableScopeFromReportFilters } from "./reportBuilderScope";

describe("printable report scope", () => {
  it("adopts the longest custom period the document endpoint accepts", () => {
    // 1 January 2025 to 1 January 2026 is 366 inclusive days.
    expect(printableScopeFromReportFilters({ dateFrom: "2025-01-01", dateTo: "2026-01-01" }).customPeriod)
      .toEqual({ from: "2025-01-01", to: "2026-01-01" });
  });

  it("does not adopt a period the document endpoint would reject", () => {
    // 1 January 2025 to 15 January 2026 is 380 inclusive days.
    const tooLong = printableScopeFromReportFilters({ dateFrom: "2025-01-01", dateTo: "2026-01-15" });
    expect(tooLong.customPeriod).toBeUndefined();
    expect(tooLong.removed).toContain("Date range over 366 days");

    const reversed = printableScopeFromReportFilters({ dateFrom: "2026-01-15", dateTo: "2025-01-01" });
    expect(reversed.customPeriod).toBeUndefined();
    expect(reversed.removed).toContain("Date range ending before it starts");
  });

  it("carries the filters it can honour and names the dates it cannot", () => {
    const carried = printableScopeFromReportFilters({ queue: "needs_review", barangay: " Bacoor " });
    expect(carried.filters.queue).toBe("needs_review");
    expect(carried.filters.barangay).toBe("Bacoor");
    expect(carried.removed).toEqual([]);

    expect(printableScopeFromReportFilters({ dateFrom: "2026-01-01" }).removed).toContain("From date");
    expect(printableScopeFromReportFilters({ dateTo: "2026-01-01" }).removed).toContain("To date");
  });
});
