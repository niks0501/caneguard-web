import { describe, expect, it } from "vitest";
import { MockFieldSurveysRepository } from "./MockFieldSurveysRepository";

describe("MockFieldSurveysRepository", () => {
  it("returns an empty collection without inventing captured boundary data", async () => {
    const result = await new MockFieldSurveysRepository().listFieldSurveys();

    expect(result).toEqual({
      type: "FeatureCollection",
      features: [],
      metadata: { totalCount: 0, returnedCount: 0, limit: 100, truncated: false, page: 1, pageCount: 1 },
    });
  });

  it("uses the requested collection limit", async () => {
    const result = await new MockFieldSurveysRepository().listFieldSurveys(25);
    expect(result.metadata.limit).toBe(25);
  });
});
