import { describe, expect, it } from "vitest";
import type { FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";
import { boundaryNeedsLookup, boundarySelectionState } from "./boundarySelection";

const feature = { properties: { id: 7 } } as FieldSurveyBoundaryFeature;

describe("boundarySelectionState", () => {
  it("names each way a boundary can be selected or fail to open", () => {
    const base = { requestedId: "7", feature: null, lookup: "idle" as const, openedOnMap: false };
    expect(boundarySelectionState({ ...base, requestedId: null })).toBe("none");
    expect(boundarySelectionState({ ...base, feature })).toBe("list");
    expect(boundarySelectionState({ ...base, feature, openedOnMap: true })).toBe("map");
    expect(boundarySelectionState({ ...base, lookup: "loading" })).toBe("loading");
    expect(boundarySelectionState({ ...base, lookup: "done" })).toBe("missing");
    expect(boundarySelectionState({ ...base, lookup: "error" })).toBe("unavailable");
    expect(boundarySelectionState({ ...base, requestedId: "abc" })).toBe("missing");
  });
});

describe("boundaryNeedsLookup", () => {
  it("fetches by number only for a numeric id missing from a settled list", () => {
    expect(boundaryNeedsLookup("7", null, true)).toBe(true);
    expect(boundaryNeedsLookup("7", feature, true)).toBe(false);
    expect(boundaryNeedsLookup("7", null, false)).toBe(false);
    expect(boundaryNeedsLookup("0", null, true)).toBe(false);
    expect(boundaryNeedsLookup("7; drop", null, true)).toBe(false);
    expect(boundaryNeedsLookup(null, null, true)).toBe(false);
  });
});
