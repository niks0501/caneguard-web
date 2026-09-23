import { describe, expect, it } from "vitest";
import { MockFieldValidationRepository } from "./MockFieldValidationRepository";

describe("MockFieldValidationRepository", () => {
  it("keeps the queue fixed to field validation and excludes resolved map points by default", async () => {
    const repository = new MockFieldValidationRepository();

    const map = await repository.getMap();
    const queue = await repository.getQueue();

    expect(map.features.every((feature) => feature.properties.reviewStatus !== "resolved")).toBe(true);
    expect(queue.items.every((item) => item.reviewStatus === "for_field_validation")).toBe(true);
  });

  it("includes mock map points with valid worldwide coordinates", async () => {
    const map = await new MockFieldValidationRepository().getMap();

    expect(map.features.length).toBeGreaterThan(0);
    for (const feature of map.features) {
      const [longitude, latitude] = feature.geometry.coordinates;
      expect(Number.isFinite(longitude)).toBe(true);
      expect(Number.isFinite(latitude)).toBe(true);
      expect(longitude).toBeGreaterThanOrEqual(-180);
      expect(longitude).toBeLessThanOrEqual(180);
      expect(latitude).toBeGreaterThanOrEqual(-90);
      expect(latitude).toBeLessThanOrEqual(90);
    }
  });
});
