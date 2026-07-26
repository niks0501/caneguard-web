import type {
  DiseaseReport,
  PaginatedReports,
  ReportFilters,
} from "../../domain/report.types";
import type { ReportReviewInput } from "../../domain/review.types";

export interface ReportsRepository {
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport>;
}
