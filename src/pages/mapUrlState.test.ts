import { describe, expect, it } from "vitest";
import { parseMapUrl, writeMapUrl } from "./mapUrlState";

describe("mapUrlState", () => {
  it("parses an operational queue together with map filters", () => {
    expect(
      parseMapUrl(
        new URLSearchParams({
          queue: "needs_visit",
          status: "for_field_validation",
          predicted_label: "rust",
          barangay: "Mabini",
          date_from: "2026-08-01",
          date_to: "2026-08-13",
        }),
      ),
    ).toEqual({
      filters: {
        queue: "needs_visit",
        status: "for_field_validation",
        disease: "rust",
        barangay: "Mabini",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-13",
      },
      hasActiveFilters: true,
      invalid: false,
    });
  });

  it("rejects invalid values and preserves normalized URL output", () => {
    expect(
      parseMapUrl(new URLSearchParams("status=confirmed&date_from=2026-08-14&date_to=2026-08-13")).invalid,
    ).toBe(true);
    expect(
      writeMapUrl({
        queue: "follow_up_due",
        status: "resolved",
        disease: "mosaic",
        barangay: " Mabini ",
        dateFrom: "2026-08-01",
      }).toString(),
    ).toBe("queue=follow_up_due&status=resolved&predicted_label=mosaic&barangay=Mabini&date_from=2026-08-01");
  });
});
