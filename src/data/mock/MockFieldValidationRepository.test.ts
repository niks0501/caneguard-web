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
});
