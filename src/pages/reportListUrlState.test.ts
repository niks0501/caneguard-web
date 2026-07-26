import { describe, expect, it } from "vitest";
import {
  parseReportListUrl,
  reportListPageSize,
} from "./reportListUrlState";

describe("parseReportListUrl", () => {
  it("maps canonical URL state to repository filters", () => {
    const state = parseReportListUrl(
      new URLSearchParams({
        page: "2",
        search: "CG-2026",
        status: "submitted_unverified",
        predicted_label: "rust",
        barangay: "Mabini",
        date_from: "2026-07-01",
        date_to: "2026-07-27",
        sort: "confidence_desc",
      }),
    );

    expect(state).toEqual({
      filters: {
        page: 2,
        perPage: reportListPageSize,
        search: "CG-2026",
        status: "submitted_unverified",
        disease: "rust",
        barangay: "Mabini",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-27",
        sort: "confidence_desc",
      },
      hasActiveFilters: true,
      invalid: false,
    });
  });

  it.each([
    ["page=0"],
    ["page=not-a-number"],
    ["status=confirmed"],
    ["predicted_label=smut"],
    ["date_from=2026-07-31&date_to=2026-07-01"],
    ["date_from=2026-02-30"],
    ["sort=random"],
  ])("rejects an invalid known query: %s", (query) => {
    expect(parseReportListUrl(new URLSearchParams(query)).invalid).toBe(true);
  });

  it("preserves spaces needed while editing text filters", () => {
    const state = parseReportListUrl(
      new URLSearchParams({
        search: "Ana ",
        barangay: "San Isidro",
      }),
    );

    expect(state.filters.search).toBe("Ana ");
    expect(state.filters.barangay).toBe("San Isidro");
  });
});
