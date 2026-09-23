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

  it("provides located Nasugbu mock reports for the monitoring map", async () => {
    const map = await new MockFieldValidationRepository().getMap();

    expect(map.features.length).toBeGreaterThan(0);
    for (const feature of map.features) {
      const [longitude, latitude] = feature.geometry.coordinates;
      expect(longitude).toBeGreaterThanOrEqual(120.567055);
      expect(longitude).toBeLessThanOrEqual(120.84818);
      expect(latitude).toBeGreaterThanOrEqual(14.043883);
      expect(latitude).toBeLessThanOrEqual(14.221364);
      expect(feature.properties.province).toBe("Batangas");
      expect(feature.properties.municipality).toBe("Nasugbu");
    }
  });
});
