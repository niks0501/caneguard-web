import { describe, expect, it } from "vitest";
import { MockReportsRepository } from "./MockReportsRepository";

describe("mock review persistence", () => {
  it("reads back decisions, notes, actions and follow-up assignments without overwriting newer work", async () => {
    const repository = new MockReportsRepository();
    const initial = (await repository.listReports()).reports[0];
    const version = initial.reviewVersion ?? 0;
    const reviewed = await repository.updateReview(initial.uuid, {
      expectedVersion: version,
      authorityClassifiedCondition: "smut",
      verificationOutcome: "not_determined",
      notes: "Inspect the affected field",
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: "inspector-1",
      fieldValidationTargetDate: "2026-12-01",
      caseState: "open",
    });
    const assignment = await repository.getReportById(initial.uuid);
    expect(assignment?.reviewNotes).toBe("Inspect the affected field");
    expect(assignment?.fieldValidationAssignment?.targetVisitDate).toBe("2026-12-01");
    expect(assignment?.lifecycle?.fieldValidationState).toBe("assigned");

    await repository.recordHandoffNote(initial.uuid, {
      expectedVersion: reviewed.reviewVersion!,
      destination: "District office",
      sentDate: "2026-12-02",
      note: "Request follow-up",
    });
    await expect(repository.updateReview(initial.uuid, {
      expectedVersion: reviewed.reviewVersion!,
      notes: "Stale note",
    })).rejects.toMatchObject({ status: 409 });

    const latest = await repository.getReportById(initial.uuid);
    expect(latest?.reviewNotes).toBe("Inspect the affected field");
    expect(latest?.handoffNotes?.[0].note).toBe("Request follow-up");
    const updated = await repository.updateReview(initial.uuid, {
      expectedVersion: latest!.reviewVersion!,
      actionTaken: "technical_assistance_provided",
      notes: "Advice provided to the grower",
    });
    const saved = await repository.getReportById(initial.uuid);
    expect(saved?.actionTaken).toBe("technical_assistance_provided");
    expect(saved?.reviewNotes).toBe("Advice provided to the grower");
    expect(saved?.reviewEvents?.[0].notes).toBe("Advice provided to the grower");
    expect(saved?.reviewVersion).toBe(updated.reviewVersion);
  });
});
