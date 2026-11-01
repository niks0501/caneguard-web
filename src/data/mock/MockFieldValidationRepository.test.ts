import { describe, expect, it } from "vitest";
import { MockFieldValidationRepository } from "./MockFieldValidationRepository";
import { MockReportsRepository } from "./MockReportsRepository";

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

  it("marks a case the List tags as a reporter mismatch as a Note on the map too", async () => {
    const map = await new MockFieldValidationRepository().getMap();
    const list = await new MockReportsRepository().listReports({ perPage: 100 });
    const mismatchUuids = list.reports
      .filter((report) => report.mismatchReported === true)
      .map((report) => report.uuid);

    expect(mismatchUuids.length).toBeGreaterThan(0);
    const mismatchPins = map.features.filter((feature) => mismatchUuids.includes(feature.properties.uuid));
    expect(mismatchPins.length).toBeGreaterThan(0);
    for (const pin of mismatchPins) {
      expect(pin.properties.mismatchReported).toBe(true);
    }
  });

  it("projects review versions and assignments from the report store reviews write to", async () => {
    const reportsRepository = new MockReportsRepository();
    const fieldValidationRepository = new MockFieldValidationRepository();
    const queued = (await fieldValidationRepository.getQueue({ queue: "needs_visit" })).items[0];

    const reviewed = await reportsRepository.updateReview(queued.uuid, {
      expectedVersion: queued.reviewVersion ?? 0,
      caseState: "open",
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-1",
      fieldValidationTargetDate: "2026-12-01",
    });

    const afterReview = (await fieldValidationRepository.getQueue({ queue: "needs_visit" }))
      .items.find((item) => item.uuid === queued.uuid);
    expect(afterReview?.reviewVersion).toBe(reviewed.reviewVersion);
    expect(afterReview?.assignee?.uuid).toBe("inspector-1");
    expect(afterReview?.targetVisitDate).toBe("2026-12-01");

    const saved = await reportsRepository.updateReview(queued.uuid, {
      expectedVersion: afterReview?.reviewVersion ?? 0,
      fieldValidationAssigneeUuid: "inspector-2",
    });
    expect(saved.fieldValidationAssignment?.assignee?.uuid).toBe("inspector-2");

    await reportsRepository.updateReview(queued.uuid, {
      expectedVersion: saved.reviewVersion ?? 0,
      caseState: "closed",
    });
    const closedQueue = await fieldValidationRepository.getQueue({ queue: "needs_visit" });
    expect(closedQueue.items.some((item) => item.uuid === queued.uuid)).toBe(false);
  });
});
