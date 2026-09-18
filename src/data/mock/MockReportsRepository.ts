import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  Advisory,
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  ExpertReferralResponseInput,
  ReportReferralInput,
  ReportReviewInput,
} from "../../domain/review.types";
import { diseaseLabels } from "../../domain/report.metadata";
import {
  legacyLifecycleForReviewStatus,
  legacyReviewStatusForLifecycle,
} from "../api/mappers/lifecycle.mapper";
import { mockReports } from "./mockReports";

const cloneReport = (report: DiseaseReport): DiseaseReport => ({
  ...report,
  updatedAt: report.updatedAt ?? report.submittedAt,
  reviewVersion: report.reviewVersion ?? 0,
  symptoms: report.symptoms.map((symptom) => ({ ...symptom })),
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

export class MockReportsRepository implements ReportsRepository {
  private reports = mockReports.map(cloneReport);

  async listAdvisories(): Promise<Advisory[]> {
    return [];
  }

  async listReports(filters?: ReportFilters): Promise<PaginatedReports> {
    const search = filters?.search?.trim().toLowerCase();

    const filtered = this.reports
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
        const matchesQueue =
          !filters?.queue ||
          (filters.queue === "needs_review" &&
            report.reviewStatus === "submitted_unverified") ||
          (filters.queue === "needs_visit" &&
            report.reviewStatus === "for_field_validation");
        const matchesDisease =
          !filters?.disease ||
          filters.disease === "all" ||
          report.predictedDisease === filters.disease;
        const matchesBarangay =
          !filters?.barangay ||
          filters.barangay === "all" ||
          report.barangay === filters.barangay;
        const submittedDate = report.submittedAt.slice(0, 10);
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
          const firstDue = first.followUp?.dueOn ?? null;
          const secondDue = second.followUp?.dueOn ?? null;
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

  async listExpertQueue(filters?: ReportFilters): Promise<PaginatedReports> {
    return this.listReports(filters);
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
        report.submittedAt.slice(0, 10),
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
      reviewedAt: new Date().toISOString(),
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.reports[index] = updated;
    return cloneReport(updated);
  }

  async recordReferral(
    reportId: string,
    input: ReportReferralInput,
  ): Promise<DiseaseReport> {
    const index = this.reports.findIndex((report) => report.uuid === reportId);
    if (index === -1) throw new Error(`Report ${reportId} was not found.`);

    const current = this.reports[index];
    const lifecycle = current.lifecycle ?? legacyLifecycleForReviewStatus(current.reviewStatus);
    const now = new Date().toISOString();
    const nextLifecycle = { ...lifecycle, referralState: "referred" as const };
    const updated: DiseaseReport = {
      ...current,
      actionTaken: "referred_for_expert_validation",
      authorityClassifiedCondition:
        input.authorityClassifiedCondition === undefined
          ? current.authorityClassifiedCondition
          : input.authorityClassifiedCondition,
      reviewNotes:
        input.officeNotes === undefined
          ? current.reviewNotes
          : input.officeNotes?.trim() || undefined,
      reviewStatus: legacyReviewStatusForLifecycle(nextLifecycle),
      lifecycle: nextLifecycle,
      referral: {
        destination: input.destination.trim(),
        reference: input.reference.trim(),
        referralDate: input.referralDate,
        note: input.note?.trim() || null,
        officeContext: {
          caseState: lifecycle.caseState,
          verificationOutcome:
            input.verificationOutcome ?? lifecycle.verificationOutcome,
          fieldValidationState: lifecycle.fieldValidationState,
          actionTaken: "referred_for_expert_validation",
          authorityClassifiedCondition:
            input.authorityClassifiedCondition === undefined
              ? current.authorityClassifiedCondition
              : input.authorityClassifiedCondition,
          notes:
            input.officeNotes === undefined
              ? current.reviewNotes ?? null
              : input.officeNotes?.trim() || null,
          reviewer: null,
          reviewedAt: now,
        },
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      reviewedAt: now,
      updatedAt: now,
    };
    updated.lifecycle = {
      ...nextLifecycle,
      verificationOutcome:
        input.verificationOutcome ?? lifecycle.verificationOutcome,
    };
    this.reports[index] = updated;
    return cloneReport(updated);
  }

  async recordExpertReferralResponse(
    reportId: string,
    input: ExpertReferralResponseInput,
  ): Promise<DiseaseReport> {
    const index = this.reports.findIndex((report) => report.uuid === reportId);
    if (index === -1) throw new Error(`Report ${reportId} was not found.`);

    const current = this.reports[index];
    if (!current.referral) throw new Error("The report has no referral.");
    const lifecycle = current.lifecycle ?? legacyLifecycleForReviewStatus(current.reviewStatus);
    const now = new Date().toISOString();
    const updated: DiseaseReport = {
      ...current,
      authorityClassifiedCondition:
        input.authorityClassifiedCondition === undefined
          ? current.authorityClassifiedCondition
          : input.authorityClassifiedCondition,
      reviewStatus: legacyReviewStatusForLifecycle({
        ...lifecycle,
        verificationOutcome:
          input.verificationOutcome ?? lifecycle.verificationOutcome,
      }),
      lifecycle: {
        ...lifecycle,
        verificationOutcome:
          input.verificationOutcome ?? lifecycle.verificationOutcome,
        referralState: "expert_response_received",
      },
      referral: {
        ...current.referral,
        responseDate: input.responseDate,
        responseNote: input.responseNote?.trim() || null,
        responseFinding: input.responseFinding?.trim() || null,
        responseRecordedAt: now,
      },
      reviewVersion: (current.reviewVersion ?? 0) + 1,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reports[index] = updated;
    return cloneReport(updated);
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
}
