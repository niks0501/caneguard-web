import { describe, expect, it } from "vitest";
import { operationalQueueValues } from "../../domain/operationalQueue";
import type { DiseaseReport, ReportLifecycle } from "../../domain/report.types";
import { MockDashboardRepository } from "./MockDashboardRepository";
import { MockFieldValidationRepository } from "./MockFieldValidationRepository";
import { MockReportsRepository } from "./MockReportsRepository";
import { isInOperationalQueue } from "./mockOperationalQueues";
import { mockReports } from "./mockReports";

const openUnassigned: ReportLifecycle = {
  caseState: "open",
  verificationOutcome: "not_determined",
  fieldValidationState: "unassigned",
  referralState: "not_referred",
};

const openAssigned: ReportLifecycle = {
  ...openUnassigned,
  fieldValidationState: "assigned",
};

describe("mock operational queues", () => {
  it("uses the same queue predicates for dashboard counts and workspace records", async () => {
    const dashboard = await new MockDashboardRepository().getSummary("2026-07");
    const reportsRepository = new MockReportsRepository();
    const fieldValidationRepository = new MockFieldValidationRepository();

    for (const queue of operationalQueueValues) {
      const list = await reportsRepository.listReports({ queue, perPage: 100 });
      expect(dashboard.queues[queue]).toBe(list.meta.total);

      if (queue === "needs_visit" || queue === "follow_up_due" || queue === "upcoming") {
        const [workspace, map] = await Promise.all([
          fieldValidationRepository.getQueue({ queue, limit: 100 }),
          fieldValidationRepository.getMap({ queue }),
        ]);
        expect(workspace.count).toBe(list.meta.total);
        expect(workspace.items.map((item) => item.uuid).sort()).toEqual(
          list.reports.map((report) => report.uuid).sort(),
        );
        expect(map.metadata.totalCount).toBe(list.meta.total);
      }
    }
  });

  it("keeps review and visit states distinct and schedules as intentional visit subsets", () => {
    const submitted = mockReports.find((report) => report.reviewStatus === "submitted_unverified")!;
    const completedValidation: DiseaseReport = {
      ...submitted,
      lifecycle: { ...openUnassigned, fieldValidationState: "completed" },
      reviewStatus: "for_field_validation",
    };
    const legacyUnassigned: DiseaseReport = {
      ...submitted,
      lifecycle: undefined,
      reviewStatus: "for_field_validation",
      fieldValidationAssignment: undefined,
    };
    const referredResponse: DiseaseReport = {
      ...submitted,
      actionTaken: "referred_for_expert_validation",
      lifecycle: { ...openUnassigned, referralState: "expert_response_received" },
    };
    const scheduled: DiseaseReport = {
      ...submitted,
      lifecycle: openAssigned,
      fieldValidationAssignment: {
        uuid: "assignment-1",
        assignee: { uuid: "assignee-1", name: "Field Inspector" },
        assignedBy: { uuid: "reviewer-1", name: "Reviewer" },
        targetVisitDate: "2026-09-30",
        activatedAt: "2026-09-20T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
      },
    };
    const closed = {
      ...scheduled,
      lifecycle: { ...openAssigned, caseState: "closed" as const },
    };
    const duplicate = {
      ...scheduled,
      canonicalLinkage: {
        isDuplicate: true,
        canonicalCase: null,
        linkedBy: null,
      },
    };

    expect(isInOperationalQueue(completedValidation, "needs_review")).toBe(true);
    expect(isInOperationalQueue(completedValidation, "needs_visit")).toBe(false);
    expect(isInOperationalQueue(legacyUnassigned, "needs_visit")).toBe(true);
    expect(isInOperationalQueue(legacyUnassigned, "needs_review")).toBe(false);
    expect(isInOperationalQueue(referredResponse, "needs_review")).toBe(true);
    expect(isInOperationalQueue(scheduled, "needs_visit", "2026-09-30")).toBe(true);
    expect(isInOperationalQueue(scheduled, "follow_up_due", "2026-09-30")).toBe(false);
    expect(isInOperationalQueue(scheduled, "upcoming", "2026-09-30")).toBe(true);
    expect(isInOperationalQueue(scheduled, "follow_up_due", "2026-10-01")).toBe(true);
    expect(isInOperationalQueue(scheduled, "upcoming", "2026-10-01")).toBe(false);
    expect(isInOperationalQueue(closed, "needs_visit")).toBe(false);
    expect(isInOperationalQueue(duplicate, "needs_visit")).toBe(false);
  });
});
