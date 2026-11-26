import { describe, expect, it } from "vitest";
import { NO_FIELD_MAP_FILTERS } from "./fieldMapStatus";
import { parseFieldMapFilters, writeFieldMapFilters } from "./fieldMapUrlState";

describe("field map url state", () => {
  it("defaults missing and invalid values to all", () => {
    expect(parseFieldMapFilters(new URLSearchParams())).toEqual(NO_FIELD_MAP_FILTERS);
    expect(parseFieldMapFilters(new URLSearchParams("fm_status=bogus&fm_period=5"))).toEqual(NO_FIELD_MAP_FILTERS);
  });
  it("parses valid values", () => {
    expect(parseFieldMapFilters(new URLSearchParams("fm_inspector=u1&fm_status=waiting&fm_period=30"))).toEqual({
      inspector: "u1", status: "waiting", period: "30",
    });
  });
  it("writes only non-default values and preserves other params", () => {
    const next = writeFieldMapFilters(
      new URLSearchParams("view=boundaries&boundary=4&report=r&fm_period=7"),
      { inspector: "u1", status: "all", period: "all" },
    );
    expect(next.toString()).toBe("view=boundaries&boundary=4&report=r&fm_inspector=u1");
  });
});
