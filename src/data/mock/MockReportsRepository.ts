import type { ReportsRepository } from "../contracts/ReportsRepository";
import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import type {
  Advisory,
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
  ReportReviewEvent,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ReportReviewInput,
  HandoffNoteInput,
} from "../../domain/review.types";
import { diseaseLabels } from "../../domain/report.metadata";
import { manilaDateAt, manilaMonthAt } from "../../domain/reportingTime";
import {
  legacyLifecycleForReviewStatus,
  legacyReviewStatusForLifecycle,
} from "../api/mappers/lifecycle.mapper";
import { isCanonicalWorkReport, isInOperationalQueue } from "./mockOperationalQueues";
import { mockReports } from "./mockReports";

const cloneReport = (report: DiseaseReport): DiseaseReport => ({
  ...report,
  updatedAt: report.updatedAt ?? report.submittedAt,
  reviewVersion: report.reviewVersion ?? 0,
  symptoms: report.symptoms.map((symptom) => ({ ...symptom })),
  reviewEvents: report.reviewEvents
    ? report.reviewEvents.map((event) => ({
        ...event,
        actor: event.actor ? { ...event.actor } : null,
      }))
    : [],
  referral: report.referral
    ? {
        ...report.referral,
        officeContext: { ...report.referral.officeContext },
      }
    : report.referral,
});

const exportHeaders = [
  "case_reference",
  "submitted_date",
  "barangay",
  "farmer_or_farm_reference",
  "possible_ai_condition",
  "affected_area_hectares",
  "affected_portion_percent",
  "verification_outcome",
  "case_state",
  "field_validation_state",
  "field_validator",
  "assigned_by",
  "target_visit_date",
  "action_taken",
  "referral_state",
  "referral_destination",
  "referral_reference",
  "referral_date",
  "expert_response_date",
];

function csvCell(value: unknown): string {
  const cell = value === null || value === undefined ? "" : String(value);
  return /[",\\r\\n]/.test(cell)
    ? `"${cell.replaceAll('"', '""')}"`
    : cell;
}

function reportersForMockAssignment(uuid: string) {
  return {
    uuid,
    name: "Field Inspector",
  };
}

export class MockReportsRepository implements ReportsRepository {
  private reports = mockReports.map(cloneReport);

  async listAdvisories(): Promise<Advisory[]> {
    return [];
  }

  async listReports(filters?: ReportFilters): Promise<PaginatedReports> {
    const search = filters?.search?.trim().toLowerCase();
    const today = manilaDateAt();

    const filtered = this.reports
      .filter(isCanonicalWorkReport)
      .filter((report) => {
        const matchesSearch =
          !search ||
          [
            report.referenceCode,
            report.barangay,
            report.submittedByName,
            diseaseLabels[report.predictedDisease],
          ].some((value) => value.toLowerCase().includes(search));
        const matchesStatus =
          !filters?.status ||
          filters.status === "all" ||
          report.reviewStatus === filters.status;
        const matchesQueue = !filters?.queue
          || isInOperationalQueue(report, filters.queue, today);
        const matchesDisease =
          !filters?.disease ||
          filters.disease === "all" ||
          report.predictedDisease === filters.disease;
        const matchesBarangay =
          !filters?.barangay ||
          filters.barangay === "all" ||
          report.barangay === filters.barangay;
        const submittedDate = manilaDateAt(new Date(report.submittedAt));
        const matchesDateFrom =
          !filters?.dateFrom || submittedDate >= filters.dateFrom;
        const matchesDateTo =
          !filters?.dateTo || submittedDate <= filters.dateTo;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesQueue &&
          matchesDisease &&
          matchesBarangay &&
          matchesDateFrom &&
          matchesDateTo
        );
      })
      .sort((first, second) => {
        if (filters?.sort === "due_soonest") {
          const firstDue = first.fieldValidationAssignment?.targetVisitDate
            ?? first.followUp?.dueOn
            ?? null;
          const secondDue = second.fieldValidationAssignment?.targetVisitDate
            ?? second.followUp?.dueOn
            ?? null;
          if (firstDue === secondDue) {
            return new Date(first.submittedAt).getTime() - new Date(second.submittedAt).getTime();
          }
          if (firstDue === null) return 1;
          if (secondDue === null) return -1;
          return firstDue.localeCompare(secondDue);
        }
        const dateDifference =
          new Date(second.submittedAt).getTime() -
          new Date(first.submittedAt).getTime();
        return filters?.sort === "oldest" ? -dateDifference : dateDifference;
      });

    const perPage = filters?.perPage ?? 15;
    const page = filters?.page ?? 1;
    const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
    const start = (page - 1) * perPage;
    const reports = filtered.slice(start, start + perPage).map(cloneReport);

    return {
      reports,
      meta: {
        currentPage: page,
        from: reports.length ? start + 1 : null,
        lastPage,
        perPage,
        to: reports.length ? start + reports.length : null,
        total: filtered.length,
      },
    };
  }

  async exportReports(filters?: ReportFilters): Promise<Blob> {
    const result = await this.listReports({
      ...filters,
      page: 1,
      perPage: Math.max(this.reports.length, 1),
    });
    const rows = result.reports.map((report) => {
      const lifecycle = report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);
      return [
        report.referenceCode,
        manilaDateAt(new Date(report.submittedAt)),
        report.barangay,
        report.farmerOrFarmOwnerName ?? report.farmReference,
        `Possible ${report.predictedDisease}`,
        report.affectedAreaHectares,
        report.affectedPortionPercent,
        lifecycle.verificationOutcome,
        lifecycle.caseState,
        lifecycle.fieldValidationState,
        report.fieldValidationAssignment?.assignee.name,
        report.fieldValidationAssignment?.assignedBy.name,
        report.fieldValidationAssignment?.targetVisitDate,
        report.actionTaken,
        lifecycle.referralState,
        report.referral?.destination,
        report.referral?.reference,
        report.referral?.referralDate,
        report.referral?.responseDate,
      ].map(csvCell).join(",");
    });

    return new Blob([
      [exportHeaders.join(","), ...rows].join("\\r\\n"),
    ], { type: "text/csv;charset=utf-8" });
  }

  async getMonthlySummary(month?: string): Promise<MonthlyReportSummary> {
    const selectedMonth = month ?? manilaMonthAt();
    const monthlyReports = this.reports.filter((report) =>
      isCanonicalWorkReport(report)
      && manilaMonthAt(new Date(report.submittedAt)) === selectedMonth,
    );

    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

    return {
      month: selectedMonth,
      period: {
        from: `${selectedMonth}-01`,
        to: lastDay,
      },
      reportedCases: monthlyReports.length,
    };
  }

  async getReportById(reportId: string): Promise<DiseaseReport | null> {
    const report = this.reports.find((item) => item.uuid === reportId);
    return report ? cloneReport(report) : null;
  }

  async getPossibleRecentMatches(): Promise<PossibleRecentMatches> {
    return {
      matches: [],
      message: "No possible recent match was found for this case.",
      possibleMatch: false,
      canSubmit: true,
      assessment: "location_unavailable",
      recentWindowHours: 72,
      locationRadiusMeters: 100,
    };
  }

  async updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport> {
    const index = this.reports.findIndex((report) => report.uuid === reportId);
    if (index === -1) {
      throw new Error(`Report ${reportId} was not found.`);
    }

    const current = this.reports[index];
    const lifecycle = current.lifecycle ?? legacyLifecycleForReviewStatus(current.reviewStatus);
    const legacyLifecycle = input.status
      ? legacyLifecycleForReviewStatus(input.status)
      : lifecycle;
    const nextLifecycle =
      input.status && input.caseState === undefined && input.verificationOutcome === undefined
        ? {
            ...lifecycle,
            caseState: legacyLifecycle.caseState,
            verificationOutcome: legacyLifecycle.verificationOutcome,
          }
        : {
            ...lifecycle,
            caseState: input.caseState ?? lifecycle.caseState,
            verificationOutcome:
              input.verificationOutcome ?? lifecycle.verificationOutcome,
            fieldValidationState:
              input.fieldValidationState
              ?? (input.fieldValidationAssigneeUuid ? "assigned" : lifecycle.fieldValidationState),
          };
    const now = new Date().toISOString();
    const nextAssignment = input.fieldValidationAssigneeUuid === undefined
      && input.fieldValidationTargetDate === undefined
      ? current.fieldValidationAssignment
      : input.fieldValidationAssigneeUuid
        ? {
            uuid: current.fieldValidationAssignment?.uuid ?? `mock-assignment-${reportId}`,
            assignee: reportersForMockAssignment(input.fieldValidationAssigneeUuid),
            assignedBy: current.fieldValidationAssignment?.assignedBy ?? {
              uuid: "00000000-0000-4000-8000-000000000100",
              name: "Maria Santos",
            },
            ...(input.fieldValidationTargetDate !== undefined
              ? input.fieldValidationTargetDate
                ? { targetVisitDate: input.fieldValidationTargetDate }
                : {}
              : current.fieldValidationAssignment?.targetVisitDate
                ? { targetVisitDate: current.fieldValidationAssignment.targetVisitDate }
                : {}),
            activatedAt: current.fieldValidationAssignment?.activatedAt ?? now,
            updatedAt: now,
            completion: current.fieldValidationAssignment?.completion,
          }
        : null;
    const newEvent: ReportReviewEvent = {
      id: (current.reviewEvents?.length ?? 0) + 1,
      actor: {
        uuid: "00000000-0000-4000-8000-000000000100",
        name: "Maria Santos",
      },
      actionTaken:
        input.actionTaken === undefined
          ? current.actionTaken ?? null
          : input.actionTaken,
      authorityClassifiedCondition:
        input.authorityClassifiedCondition === undefined
          ? current.authorityClassifiedCondition ?? null
          : input.authorityClassifiedCondition,
      verificationOutcome: nextLifecycle.verificationOutcome ?? null,
      notes:
        input.notes === undefined
          ? current.reviewNotes ?? null
          : input.notes?.trim() || null,
      caseState: nextLifecycle.caseState ?? null,
      createdAt: now,
    };
    const updated: DiseaseReport = {
      ...current,
      reviewStatus: input.status ?? legacyReviewStatusForLifecycle(nextLifecycle),
      reviewNotes:
        input.notes === undefined
          ? current.reviewNotes
          : input.notes?.trim() || undefined,
      authorityClassifiedCondition:
        input.authorityClassifiedCondition === undefined
          ? current.authorityClassifiedCondition
          : input.authorityClassifiedCondition,
      actionTaken:
        input.actionTaken === undefined ? current.actionTaken : input.actionTaken,
      lifecycle: nextLifecycle,
      fieldValidationAssignment: nextAssignment ?? undefined,
      reviewedAt: now,
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: now,
      reviewEvents: [newEvent, ...(current.reviewEvents ?? [])],
    };
    this.reports[index] = updated;
    return cloneReport(updated);
  }

  async recordHandoffNote(reportId: string, input: HandoffNoteInput): Promise<DiseaseReport> {
    const report = this.reports.find((item) => item.uuid === reportId);
    if (!report || report.reviewVersion !== input.expectedVersion) throw new Error("Refresh the case before saving.");
    report.handoffNotes = [{
      id: (report.handoffNotes?.length ?? 0) + 1,
      destination: input.destination.trim(),
      reference: input.reference?.trim() || null,
      sent_date: input.sentDate,
      note: input.note?.trim() || null,
      advice_received_note: input.adviceReceivedNote?.trim() || null,
    }, ...(report.handoffNotes ?? [])];
    report.reviewVersion = input.expectedVersion + 1;
    return cloneReport(report);
  }

  async linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport> {
    const duplicateIndex = this.reports.findIndex((report) => report.uuid === reportId);
    const canonical = this.reports.find(
      (report) => report.uuid === input.canonicalReportUuid,
    );
    if (duplicateIndex === -1 || !canonical) {
      throw new Error("The selected report was not found.");
    }

    const current = this.reports[duplicateIndex];
    if (current.canonicalLinkage?.isDuplicate) {
      return cloneReport(current);
    }

    const now = new Date().toISOString();
    const updated: DiseaseReport = {
      ...current,
      canonicalLinkage: {
        isDuplicate: true,
        canonicalCase: {
          uuid: canonical.uuid,
          referenceCode: canonical.referenceCode,
          submittedAt: canonical.submittedAt,
        },
        linkedBy: {
          uuid: "00000000-0000-4000-8000-000000000100",
          name: "Maria Santos",
        },
        linkedAt: now,
        reason: input.reason?.trim() || "Possible duplicate linkage recorded after authorized review.",
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: now,
    };
    this.reports[duplicateIndex] = updated;
    return cloneReport(updated);
  }

  async unlinkDuplicate(
    reportId: string,
    input: DuplicateUnlinkInput,
  ): Promise<DiseaseReport> {
    const duplicateIndex = this.reports.findIndex((report) => report.uuid === reportId);
    if (duplicateIndex === -1) {
      throw new Error("The selected report was not found.");
    }

    const current = this.reports[duplicateIndex];
    if ((current.reviewVersion ?? 0) !== input.expectedVersion) {
      throw new Error("The report changed while the duplicate link was being removed.");
    }
    if (!current.canonicalLinkage?.isDuplicate) {
      return cloneReport(current);
    }

    const updated: DiseaseReport = {
      ...current,
      canonicalLinkage: {
        ...current.canonicalLinkage,
        isDuplicate: false,
        canonicalCase: null,
        linkedBy: null,
        linkedAt: undefined,
        reason: undefined,
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.reports[duplicateIndex] = updated;
    return cloneReport(updated);
  }
}
