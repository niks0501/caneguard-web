import type { ReportsRepository } from "../contracts/ReportsRepository";
import type { DiseaseReport, ReportFilters } from "../../domain/report.types";
import type { ReportReviewInput } from "../../domain/review.types";
import { diseaseLabels } from "../../domain/report.metadata";
import { mockReports } from "./mockReports";

const cloneReport = (report: DiseaseReport): DiseaseReport => ({
  ...report,
  symptoms: report.symptoms.map((symptom) => ({ ...symptom })),
});

export class MockReportsRepository implements ReportsRepository {
  private reports = mockReports.map(cloneReport);

  async listReports(filters?: ReportFilters): Promise<DiseaseReport[]> {
    const search = filters?.search?.trim().toLowerCase();

    return this.reports
      .filter((report) => {
        const matchesSearch =
          !search ||
          [
            report.id,
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
      .map(cloneReport);
  }

  async getReportById(reportId: string): Promise<DiseaseReport | null> {
    const report = this.reports.find((item) => item.id === reportId);
    return report ? cloneReport(report) : null;
  }

  async updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport> {
    const index = this.reports.findIndex((report) => report.id === reportId);
    if (index === -1) {
      throw new Error(`Report ${reportId} was not found.`);
    }

    const current = this.reports[index];
    const updated: DiseaseReport = {
      ...current,
      reviewStatus: input.status,
      reviewNotes: input.notes.trim() || undefined,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date().toISOString(),
    };
    this.reports[index] = updated;
    return cloneReport(updated);
  }
}
