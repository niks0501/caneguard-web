import { ApiError } from "../../api/ApiError";
import type { ReportsRepository } from "../contracts/ReportsRepository";
import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import type { UpdateAffectedFieldsInput, UpdateAffectedFieldsResult } from "../../domain/fieldSurvey.types";
import type {
  AerialAnalysis,
  Advisory,
  AdvisoryDeleteResult,
  AdvisoryInput,
  AdvisoryUpdateInput,
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatch,
  PossibleRecentMatches,
  ReportFilters,
  ReportReviewEvent,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ReportReviewInput,
} from "../../domain/review.types";
import { noAiScanLabel, predictedDiseaseLabel } from "../../domain/report.metadata";
import { deriveWorkflowStatus } from "../../domain/workflowStatus";
import { manilaDateAt, manilaMonthAt } from "../../domain/reportingTime";
import {
  legacyLifecycleForReviewStatus,
  legacyReviewStatusForLifecycle,
} from "../api/mappers/lifecycle.mapper";
import { duplicateLinkBlockedReason } from "../../domain/duplicateLink";
import { isCanonicalWorkReport, isInOperationalQueue } from "./mockOperationalQueues";
import { cloneMockReport, mockReportStore } from "./mockReportStore";

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

const ADVISORY_REMOVED_MESSAGE = "This advisory was removed from the office library. Pick another one.";

interface MockAdvisory extends Advisory {
  archived?: boolean;
}

function publicAdvisory(item: MockAdvisory): Advisory {
  const advisory: MockAdvisory = { ...item };
  delete advisory.archived;
  return advisory;
}

const seededCodeCounts: Record<string, number> = {};

function seedAdvisory(index: number, category: Advisory["category"], title: string, content: string): MockAdvisory {
  const suffix = String(index).padStart(2, "0");
  const topic = (category ?? "general").toUpperCase();
  seededCodeCounts[topic] = (seededCodeCounts[topic] ?? 0) + 1;
  return {
    uuid: `5c21f90a-5a40-4d8d-ae35-1275bb3f01${suffix}`,
    code: `ADV-${topic}-${String(seededCodeCounts[topic]).padStart(3, "0")}`,
    title,
    content,
    status: "validated",
    category,
    validationProvenance: "CaneGuard office operational reference.",
    validatedAt: `2026-09-01T08:${suffix}:00.000Z`,
  };
}

// Demo library modelled on the office seeder: diseases, a pest and general field operations.
const seededAdvisories: MockAdvisory[] = [
  seedAdvisory(1, "general", "Document and monitor affected rows", "Mark the affected rows, record the date and visible changes, and revisit the same area to check whether symptoms are spreading. Keep the observations with the case."),
  seedAdvisory(2, "general", "Clean tools between affected areas", "Remove plant material from tools and clean them between affected areas. Keep affected material separate from healthy planting material and follow local disposal guidance."),
  seedAdvisory(3, "rust", "Manage rust on susceptible varieties", "Scout neighbouring rows for orange-brown pustules on the leaves, remove heavily affected leaves where practical, and avoid moving cutting material from the affected block until the office has checked it."),
  seedAdvisory(4, "smut", "Isolate smut-affected stools", "Cover whip-like shoots with a bag before cutting, remove the affected stool and keep it away from healthy planting material. Do not use cuttings from the affected stool."),
  seedAdvisory(5, "mosaic", "Rogue out mosaic-infected plants", "Remove plants with a clear light-and-dark mottle early and replace them with healthy setts. Keep the area monitored for aphid activity over the next weeks."),
  seedAdvisory(6, "rssi", "Check for scale insects under leaf sheaths", "Peel back leaf sheaths on a sample of stalks and record any scale insects. Report the affected rows to the office so a field visit can be arranged."),
];

// One seeded advisory was already sent on a past case, so deleting it archives it.
const seededUsedAdvisoryUuids = [seededAdvisories[1].uuid];

function reportersForMockAssignment(uuid: string) {
  return {
    uuid,
    name: "Field Inspector",
  };
}

// Demo-mode nearby matches: fixed pairs of mock cases with the server-style
// distance, so the strip, the comparison and the linked banner can be tried
// without the API. The candidate details come from the same mock store.
const mockNearbyMatches: Record<string, { uuid: string; distanceMeters: number }[]> = {
  "00000000-0000-4000-8000-000000000001": [
    { uuid: "00000000-0000-4000-8000-000000000004", distanceMeters: 38.2 },
    { uuid: "00000000-0000-4000-8000-000000000008", distanceMeters: 86.5 },
  ],
  "00000000-0000-4000-8000-000000000003": [
    { uuid: "00000000-0000-4000-8000-000000000007", distanceMeters: 24.1 },
  ],
  "00000000-0000-4000-8000-000000000007": [
    { uuid: "00000000-0000-4000-8000-000000000003", distanceMeters: 24.1 },
  ],
};

function mockPossibleMatch(candidate: DiseaseReport, distanceMeters: number): PossibleRecentMatch {
  return {
    uuid: candidate.uuid,
    referenceCode: candidate.referenceCode,
    submittedAt: candidate.submittedAt,
    condition: candidate.predictedDisease ?? "healthy",
    distanceMeters,
    basis: ["same_condition", "nearby_location", "recent_submission"],
    message: "Possible recent match. Compare this case before deciding.",
    barangay: candidate.barangay,
    farmerOrFarmOwnerName: candidate.farmerOrFarmOwnerName ?? null,
    submittedByName: candidate.submittedByName,
    workflowStatus: deriveWorkflowStatus(candidate),
    imageUrl: candidate.imageStatus === "available" ? candidate.imageUrl ?? null : null,
    imageStatus: candidate.imageStatus === "available" ? "available" : "missing",
  };
}

export class MockReportsRepository implements ReportsRepository {
  private reports = mockReportStore;
  private advisories: MockAdvisory[] = seededAdvisories.map((advisory) => ({ ...advisory }));
  private usedAdvisoryUuids = new Set(seededUsedAdvisoryUuids);

  private findLiveAdvisory(advisoryUuid: string): MockAdvisory {
    const advisory = this.advisories.find((item) => item.uuid === advisoryUuid);
    if (!advisory) throw new ApiError("Advisory not found.", { status: 404 });
    return advisory;
  }

  private nextAdvisoryCode(category: Advisory["category"]): string {
    const prefix = `ADV-${(category ?? "general").toUpperCase()}-`;
    const highest = this.advisories
      .filter((item) => item.code.startsWith(prefix))
      .map((item) => Number(item.code.slice(prefix.length)))
      .filter(Number.isInteger)
      .reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}${String(highest + 1).padStart(3, "0")}`;
  }

  private assertAdvisoryCode(code: string, ownUuid?: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code)) {
      throw new ApiError("The code is invalid.", { status: 422, code: "VALIDATION_ERROR", errors: { code: ["Use letters, numbers, dots, dashes or underscores."] } });
    }
    if (this.advisories.some((item) => item.code === code && item.uuid !== ownUuid)) {
      throw new ApiError("The code is taken.", { status: 422, code: "VALIDATION_ERROR", errors: { code: ["That code is already used by another advisory."] } });
    }
  }

  async listAdvisories(): Promise<Advisory[]> {
    return this.advisories
      .filter((item) => !item.archived)
      .map(publicAdvisory);
  }

  async createAdvisory(input: AdvisoryInput): Promise<Advisory> {
    const title = input.title.trim();
    const content = input.content.trim();
    const errors: Record<string, string[]> = {};
    if (!title) errors.title = ["The title field is required."];
    if (!content) errors.content = ["The content field is required."];
    if (Object.keys(errors).length) throw new ApiError("The given data was invalid.", { status: 422, code: "VALIDATION_ERROR", errors });
    const category = input.category ?? null;
    const requestedCode = input.code?.trim();
    if (requestedCode) this.assertAdvisoryCode(requestedCode);
    const advisory: MockAdvisory = {
      uuid: crypto.randomUUID(),
      code: requestedCode || this.nextAdvisoryCode(category),
      title,
      content,
      status: "validated",
      category,
      validatedAt: new Date().toISOString(),
    };
    this.advisories = [...this.advisories, advisory];
    return publicAdvisory(advisory);
  }

  async updateAdvisory(advisoryUuid: string, input: AdvisoryUpdateInput): Promise<Advisory> {
    const current = this.findLiveAdvisory(advisoryUuid);
    if (current.archived || current.status === "retired") {
      throw new ApiError("The given data was invalid.", { status: 422, code: "VALIDATION_ERROR", errors: { status: [current.archived
        ? "This advisory was removed from the office library and can no longer be edited."
        : "Retired advisories can no longer be edited."] } });
    }
    const code = input.code?.trim();
    if (code) this.assertAdvisoryCode(code, current.uuid);
    const next: MockAdvisory = {
      ...current,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(code ? { code } : {}),
    };
    this.advisories = this.advisories.map((item) => (item.uuid === advisoryUuid ? next : item));
    return publicAdvisory(next);
  }

  async deleteAdvisory(advisoryUuid: string): Promise<AdvisoryDeleteResult> {
    const current = this.findLiveAdvisory(advisoryUuid);
    if (this.usedAdvisoryUuids.has(advisoryUuid)) {
      this.advisories = this.advisories.map((item) => (item.uuid === advisoryUuid ? { ...current, archived: true } : item));
      return { uuid: advisoryUuid, deleted: "archived" };
    }
    this.advisories = this.advisories.filter((item) => item.uuid !== advisoryUuid);
    return { uuid: advisoryUuid, deleted: "hard" };
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
            predictedDiseaseLabel(report.predictedDisease),
          ].some((value) => value.toLowerCase().includes(search));
        const matchesStatus =
          !filters?.status ||
          filters.status === "all" ||
          report.reviewStatus === filters.status;
        const matchesWorkflowStatus =
          !filters?.workflowStatus ||
          filters.workflowStatus === "all" ||
          deriveWorkflowStatus(report) === filters.workflowStatus;
        const matchesReviewer =
          !filters?.reviewer ||
          report.fieldValidationAssignment?.assignee.uuid === filters.reviewer;
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
        const hasUsableLocation =
          typeof report.finalLatitude === "number" && Number.isFinite(report.finalLatitude)
          && report.finalLatitude >= -90 && report.finalLatitude <= 90
          && typeof report.finalLongitude === "number" && Number.isFinite(report.finalLongitude)
          && report.finalLongitude >= -180 && report.finalLongitude <= 180;
        const matchesLocation =
          !filters?.location ||
          filters.location === "all" ||
          (filters.location === "located" ? hasUsableLocation : !hasUsableLocation);
        const submittedDate = manilaDateAt(new Date(report.submittedAt));
        const matchesDateFrom =
          !filters?.dateFrom || submittedDate >= filters.dateFrom;
        const matchesDateTo =
          !filters?.dateTo || submittedDate <= filters.dateTo;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesWorkflowStatus &&
          matchesReviewer &&
          matchesQueue &&
          matchesDisease &&
          matchesBarangay &&
          matchesLocation &&
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
    const reports = filtered.slice(start, start + perPage).map(cloneMockReport);

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
        report.predictedDisease === null
          ? noAiScanLabel
          : `Possible ${report.predictedDisease}`,
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
    return report ? cloneMockReport(report) : null;
  }

  async claimReview(): Promise<boolean> {
    return true;
  }

  async releaseReview(): Promise<void> {}

  async openCase(reportId: string): Promise<{ firstReviewedAt: string | null }> {
    const report = this.reports.find((item) => item.uuid === reportId);
    if (!report) throw new Error(`Report ${reportId} was not found.`);

    if (!report.firstReviewedAt) {
      report.firstReviewedAt = new Date().toISOString();
    }

    return { firstReviewedAt: report.firstReviewedAt ?? null };
  }

  async getPossibleRecentMatches(reportId: string): Promise<PossibleRecentMatches> {
    const matches = (mockNearbyMatches[reportId] ?? []).flatMap(({ uuid, distanceMeters }) => {
      const candidate = this.reports.find((report) => report.uuid === uuid);
      // A candidate already linked as someone's duplicate is not an original case.
      return candidate && !candidate.canonicalLinkage?.isDuplicate
        ? [mockPossibleMatch(candidate, distanceMeters)]
        : [];
    });

    return {
      matches,
      message: matches.length
        ? "Possible recent matches found. You can still submit a new case."
        : "No possible recent match was found for this case.",
      possibleMatch: matches.length > 0,
      canSubmit: true,
      assessment: "condition_and_location",
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
    if ((current.reviewVersion ?? 0) !== input.expectedVersion) {
      throw new ApiError("The report changed while the review was being saved.", { status: 409 });
    }
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
    // Like the API: the wording is copied onto the case, so later library edits never rewrite it.
    const selectedAdvisory = input.advisoryUuid ? this.advisories.find((item) => item.uuid === input.advisoryUuid) : undefined;
    if (input.advisoryUuid && (!selectedAdvisory || selectedAdvisory.archived || selectedAdvisory.status !== "validated")) {
      throw new ApiError("The given data was invalid.", { status: 422, code: "VALIDATION_ERROR", errors: { advisory_uuid: [ADVISORY_REMOVED_MESSAGE] } });
    }
    if (selectedAdvisory) this.usedAdvisoryUuids.add(selectedAdvisory.uuid);
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
      ...(selectedAdvisory ? {
        advisory: {
          uuid: selectedAdvisory.uuid,
          code: selectedAdvisory.code,
          title: selectedAdvisory.title,
          content: selectedAdvisory.content,
          status: selectedAdvisory.status,
          category: selectedAdvisory.category,
          selectedAt: now,
          deliveryState: "pending" as const,
        },
      } : {}),
      lifecycle: nextLifecycle,
      fieldValidationAssignment: nextAssignment ?? undefined,
      reviewedAt: now,
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: now,
      reviewEvents: [newEvent, ...(current.reviewEvents ?? [])],
    };
    this.reports[index] = updated;
    return cloneMockReport(updated);
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
    if ((current.reviewVersion ?? 0) !== input.expectedVersion) {
      throw new ApiError("The report changed while the duplicate link was being saved.", { status: 409 });
    }
    if (current.canonicalLinkage?.isDuplicate) {
      return cloneMockReport(current);
    }
    const blockedReason = duplicateLinkBlockedReason(current);
    if (blockedReason) {
      throw new ApiError("Duplicate links can only be changed while a case is open.", {
        status: 422,
        errors: blockedReason === "closed"
          ? { case_state: ["Duplicate links can only be changed while a case is open."] }
          : { field_validation_state: ["Duplicate links cannot be changed after field evidence is completed."] },
      });
    }

    const now = new Date().toISOString();
    const currentLifecycle = current.lifecycle ?? legacyLifecycleForReviewStatus(current.reviewStatus);
    const nextLifecycle = input.closeDuplicate
      ? { ...currentLifecycle, caseState: "closed" as const }
      : currentLifecycle;
    const updated: DiseaseReport = {
      ...current,
      ...(input.closeDuplicate
        ? {
            lifecycle: nextLifecycle,
            reviewStatus: legacyReviewStatusForLifecycle(nextLifecycle),
            reviewedAt: now,
            reviewedBy: "Maria Santos",
          }
        : {}),
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
        linkBlockedReason: input.closeDuplicate ? "closed" : null,
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: now,
    };
    this.reports[duplicateIndex] = updated;
    return cloneMockReport(updated);
  }

  async addAerialAnalysis(): Promise<AerialAnalysis> {
    throw new Error("The aerial check is not available in demo mode.");
  }

  async removeAerialAnalysis(): Promise<{ removalId: string }> {
    throw new Error("The aerial check is not available in demo mode.");
  }

  async restoreAerialAnalysis(): Promise<AerialAnalysis> {
    throw new Error("The aerial check is not available in demo mode.");
  }

  async getAerialMask(): Promise<Blob> {
    throw new Error("The aerial check is not available in demo mode.");
  }

  async updateAffectedFields(
    reportId: string,
    input: UpdateAffectedFieldsInput,
  ): Promise<UpdateAffectedFieldsResult> {
    const index = this.reports.findIndex((report) => report.uuid === reportId);
    if (index === -1) throw new Error(`Report ${reportId} was not found.`);

    const current = this.reports[index];
    if ((current.reviewVersion ?? 0) !== input.expectedVersion) {
      throw new ApiError("The report changed while affected fields were being saved.", { status: 409 });
    }

    const currentFields = current.affectedFields ?? [];
    const currentById = new Map(currentFields.map((field) => [field.fieldSurveyId, field]));
    const affectedFields = input.affectedFields.map((field) => {
      const existing = currentById.get(field.fieldSurveyId);
      if (!existing) throw new Error("The selected field boundary was not found.");
      return existing;
    });
    const unchanged = currentFields.length === affectedFields.length
      && currentFields.every((field, position) =>
        field.fieldSurveyId === affectedFields[position]?.fieldSurveyId,
      );
    const updatedAt = unchanged ? current.updatedAt ?? current.submittedAt : new Date().toISOString();
    const version = unchanged ? input.expectedVersion : input.expectedVersion + 1;

    this.reports[index] = {
      ...current,
      affectedFields,
      reviewVersion: version,
      updatedAt,
    };

    return { affectedFields: cloneMockReport(this.reports[index]).affectedFields ?? [], version, updatedAt };
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
      throw new ApiError("The report changed while the duplicate link was being removed.", { status: 409 });
    }
    if (!current.canonicalLinkage?.isDuplicate) {
      return cloneMockReport(current);
    }
    if (duplicateLinkBlockedReason(current)) {
      throw new ApiError("Duplicate links can only be changed while a case is open.", { status: 422 });
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
        linkBlockedReason: null,
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.reports[duplicateIndex] = updated;
    return cloneMockReport(updated);
  }
}
