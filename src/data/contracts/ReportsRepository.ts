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

export interface ReportsRepository {
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  getPossibleRecentMatches(reportId: string): Promise<PossibleRecentMatches>;
  updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport>;
  linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport>;
}
