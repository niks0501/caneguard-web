import { describe, expect, it } from "vitest";
import {
  manilaDateAt,
  manilaMonthAt,
  previousManilaIsoWeekAt,
} from "./reportingTime";

describe("reporting periods in Asia/Manila", () => {
  it("keeps the final UTC hour of September in September", () => {
    const instant = new Date("2026-09-30T15:59:59Z");

    expect(manilaDateAt(instant)).toBe("2026-09-30");
    expect(manilaMonthAt(instant)).toBe("2026-09");
  });

  it("starts October at the Manila midnight UTC boundary", () => {
    const instant = new Date("2026-09-30T16:00:00Z");

    expect(manilaDateAt(instant)).toBe("2026-10-01");
    expect(manilaMonthAt(instant)).toBe("2026-10");
  });

  it("resolves the previous complete ISO week from Manila calendar dates", () => {
    expect(previousManilaIsoWeekAt(new Date("2026-09-30T16:00:00Z"))).toBe(
      "2026-W39",
    );
  });
});
