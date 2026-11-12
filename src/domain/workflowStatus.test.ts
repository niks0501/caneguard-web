import { describe, expect, it } from "vitest";
import {
  deriveWorkflowStatus,
  deriveWorkflowTrackReached,
  type WorkflowStatusInput,
} from "./workflowStatus";

const completedFieldCheck: WorkflowStatusInput = {
  lifecycle: {
    caseState: "open",
    verificationOutcome: "not_determined",
    fieldValidationState: "completed",
    referralState: "not_referred",
  },
};

describe("deriveWorkflowTrackReached", () => {
  it.each([
    ["needs_review", completedFieldCheck],
    ["under_review", { ...completedFieldCheck, firstReviewedAt: "2026-11-11" }],
    ["follow_up", { ...completedFieldCheck, scheduledRevisit: true }],
    ["referred", {
      ...completedFieldCheck,
      lifecycle: { ...completedFieldCheck.lifecycle!, referralState: "referred" },
    }],
  ] as const)("retains the completed field-check milestone for %s", (status, input) => {
    expect(deriveWorkflowStatus(input)).toBe(status);
    expect(deriveWorkflowTrackReached(input, status)).toBe(2);
  });

  it("preserves the field-check milestone from legacy latest-validation evidence", () => {
    const legacyVisit: WorkflowStatusInput = {
      latestValidation: {
        visitedAt: "2026-11-11T00:00:00.000Z",
        fieldObservation: "Wilting leaves",
        finding: "Needs follow-up",
        actionTaken: "Recorded observations",
      },
    };

    expect(deriveWorkflowStatus(legacyVisit)).toBe("needs_review");
    expect(deriveWorkflowTrackReached(legacyVisit)).toBe(2);
  });

  it.each([
    [{}, 0],
    [{ firstReviewedAt: "2026-11-11" }, 1],
    [{ lifecycle: { ...completedFieldCheck.lifecycle!, fieldValidationState: "assigned" } }, 2],
    [{ lifecycle: { ...completedFieldCheck.lifecycle!, caseState: "closed" } }, 3],
  ] as const)("uses the status milestone when no later completion evidence exists", (input, reached) => {
    expect(deriveWorkflowTrackReached(input)).toBe(reached);
  });
});
