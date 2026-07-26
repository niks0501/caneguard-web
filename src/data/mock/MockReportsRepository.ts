import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  DiseaseReport,
  PaginatedReports,
  ReportFilters,
} from "../../domain/report.types";
import type { ReportReviewInput } from "../../domain/review.types";
import { diseaseLabels } from "../../domain/report.metadata";
import { mockReports } from "./mockReports";

const cloneReport = (report: DiseaseReport): DiseaseReport => ({
  ...report,
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

        return matchesSearch && matchesStatus && matchesDisease && matchesBarangay;
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
    const updated: DiseaseReport = {
      ...current,
      reviewStatus: input.status,
      reviewNotes: input.notes.trim() || undefined,
      reviewedBy: "Maria Santos",
      reviewedAt: new Date().toISOString(),
    };
    this.reports[index] = updated;
    return cloneReport(updated);
  }
}
