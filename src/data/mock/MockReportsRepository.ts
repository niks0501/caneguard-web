import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
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
});

export class MockReportsRepository implements ReportsRepository {
  private reports = mockReports.map(cloneReport);

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
          matchesDisease &&
          matchesBarangay &&
          matchesDateFrom &&
          matchesDateTo
        );
      })
      .sort((first, second) => {
        if (filters?.sort === "confidence_desc") {
          return second.confidence - first.confidence;
        }
        if (filters?.sort === "confidence_asc") {
          return first.confidence - second.confidence;
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
