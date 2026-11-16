import { describe, expect, it } from "vitest";
import { countInspectorVisits, type FieldWorkloadItem } from "./fieldOperations";

const TODAY = "2026-11-16";

function visit(uuid: string, assigneeUuid: string | null, targetVisitDate: string | null, extra: Partial<FieldWorkloadItem> = {}): FieldWorkloadItem {
  return {
    uuid, referenceCode: "CG-" + uuid, barangay: "Mabini", farmReference: null, municipality: null, province: null,
    predictedDisease: "rust", observedAt: null, submittedAt: "2026-11-01T00:00:00Z", reviewStatus: "for_field_validation",
    lifecycle: undefined, fieldValidationState: "assigned", targetVisitDate,
    assignee: assigneeUuid ? { uuid: assigneeUuid, name: assigneeUuid } : null,
    finalLatitude: null, finalLongitude: null, locationSource: null, caseState: "open", scheduledRevisit: false, followUpOutcome: null,
    ...extra,
  };
}

describe("countInspectorVisits", () => {
  // Proves (L3): counts are open and late visits per inspector from the loaded workload, never inventing zero entries or counting finished work.
  it("counts open and late active visits per assignee and skips completed, closed and unassigned work", () => {
    const counts = countInspectorVisits([
      visit("a", "ana", "2026-11-10"),
      visit("b", "ana", TODAY),
      visit("c", "ana", null),
      visit("d", "ben", "2026-11-01"),
      visit("done", "ben", "2026-11-01", { fieldValidationState: "completed" }),
      visit("closed", "ben", "2026-11-01", { caseState: "closed" }),
      visit("none", null, "2026-11-01"),
    ], TODAY);
    expect(counts.get("ana")).toEqual({ open: 3, late: 1 });
    expect(counts.get("ben")).toEqual({ open: 1, late: 1 });
    expect(counts.has("cai")).toBe(false);
    expect(counts.size).toBe(2);
  });
});
