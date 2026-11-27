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

    await repository.updateReview(initial.uuid, {
      expectedVersion: reviewed.reviewVersion!,
      notes: "Inspect the affected field",
    });
    await expect(repository.updateReview(initial.uuid, {
      expectedVersion: reviewed.reviewVersion!,
      notes: "Stale note",
    })).rejects.toMatchObject({ status: 409 });

    const latest = await repository.getReportById(initial.uuid);
    expect(latest?.reviewNotes).toBe("Inspect the affected field");
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

  it("rejects stale boundary links and duplicate links with a conflict", async () => {
    const repository = new MockReportsRepository();
    const [first, second] = (await repository.listReports()).reports;
    const version = first.reviewVersion ?? 0;
    const staleVersion = version - 1;

    await expect(repository.updateAffectedFields(first.uuid, {
      expectedVersion: staleVersion,
      affectedFields: [],
    })).rejects.toMatchObject({ status: 409 });

    await expect(repository.linkDuplicate(first.uuid, {
      canonicalReportUuid: second.uuid,
      expectedVersion: staleVersion,
    })).rejects.toMatchObject({ status: 409 });

    const linked = await repository.linkDuplicate(first.uuid, {
      canonicalReportUuid: second.uuid,
      expectedVersion: version,
    });
    await expect(repository.linkDuplicate(first.uuid, {
      canonicalReportUuid: second.uuid,
      expectedVersion: version,
    })).rejects.toMatchObject({ status: 409 });

    await expect(repository.unlinkDuplicate(first.uuid, {
      expectedVersion: version,
    })).rejects.toMatchObject({ status: 409 });

    const unlinked = await repository.unlinkDuplicate(first.uuid, {
      expectedVersion: linked.reviewVersion ?? 0,
    });
    expect(unlinked.canonicalLinkage?.isDuplicate).toBe(false);
    expect(unlinked.reviewVersion).toBe((linked.reviewVersion ?? 0) + 1);
  });

  it("offers realistic nearby matches in demo mode and omits a candidate that is already a duplicate", async () => {
    const repository = new MockReportsRepository();
    const reports = (await repository.listReports()).reports;
    const first = reports.find((report) => report.referenceCode === "CG-2026-0718")!;

    const result = await repository.getPossibleRecentMatches(first.uuid);

    expect(result.possibleMatch).toBe(true);
    expect(result.matches.map((match) => match.referenceCode)).toEqual(["CG-2026-0714", "CG-2026-0706"]);
    expect(result.matches[0]).toMatchObject({
      barangay: expect.any(String),
      farmerOrFarmOwnerName: "R. Mendoza",
      workflowStatus: "needs_review",
      imageStatus: "missing",
    });
    expect(result.matches[1].workflowStatus).toBe("resolved");

    const noMatches = await repository.getPossibleRecentMatches(reports.find((report) => report.referenceCode === "CG-2026-0717")!.uuid);
    expect(noMatches.matches).toEqual([]);
    expect(noMatches.possibleMatch).toBe(false);

    await repository.linkDuplicate(result.matches[0].uuid, {
      canonicalReportUuid: first.uuid,
      expectedVersion: (await repository.getReportById(result.matches[0].uuid))!.reviewVersion ?? 0,
    });
    const afterLink = await repository.getPossibleRecentMatches(first.uuid);
    expect(afterLink.matches.map((match) => match.referenceCode)).toEqual(["CG-2026-0706"]);

    // The mock store is shared across this file's tests; leave it as found.
    await repository.unlinkDuplicate(result.matches[0].uuid, {
      expectedVersion: (await repository.getReportById(result.matches[0].uuid))!.reviewVersion ?? 0,
    });
  });

  it("links without closing by default and closes the duplicate case in one save when asked", async () => {
    const repository = new MockReportsRepository();
    const reports = (await repository.listReports()).reports;
    const open = reports.find((report) => report.referenceCode === "CG-2026-0717")!;
    const original = reports.find((report) => report.referenceCode === "CG-2026-0718")!;

    const closed = await repository.linkDuplicate(open.uuid, {
      canonicalReportUuid: original.uuid,
      expectedVersion: open.reviewVersion ?? 0,
      closeDuplicate: true,
    });

    expect(closed.lifecycle?.caseState).toBe("closed");
    expect(closed.canonicalLinkage?.linkBlockedReason).toBe("closed");
    expect(closed.reviewVersion).toBe((open.reviewVersion ?? 0) + 1);
    await expect(repository.unlinkDuplicate(open.uuid, {
      expectedVersion: closed.reviewVersion ?? 0,
    })).rejects.toMatchObject({ status: 422 });

    const other = (await repository.listReports()).reports.find((report) => report.referenceCode === "CG-2026-0709")!;
    const kept = await repository.linkDuplicate(other.uuid, {
      canonicalReportUuid: original.uuid,
      expectedVersion: other.reviewVersion ?? 0,
    });
    expect(kept.lifecycle?.caseState).toBe("open");
    expect(kept.canonicalLinkage?.linkBlockedReason).toBeNull();
  });

  it("rejects linking a closed case or one with a completed visit, as the server guard does", async () => {
    const repository = new MockReportsRepository();
    const reports = (await repository.listReports()).reports;
    const closedCase = reports.find((report) => report.lifecycle?.caseState === "closed")!;
    const original = reports.find((report) => report.lifecycle?.caseState === "open")!;

    await expect(repository.linkDuplicate(closedCase.uuid, {
      canonicalReportUuid: original.uuid,
      expectedVersion: closedCase.reviewVersion ?? 0,
    })).rejects.toMatchObject({ status: 422, errors: { case_state: expect.any(Array) } });
  });
});
