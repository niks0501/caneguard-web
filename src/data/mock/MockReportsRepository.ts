import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  DiseaseReport,
  PaginatedReports,
  ReportFilters,
} from "../../domain/report.types";
import type {
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
}
