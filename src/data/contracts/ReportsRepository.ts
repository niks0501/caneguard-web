import type { MonthlyReportSummary } from "../../domain/dashboard.types";
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

export interface ReportsRepository {
  listAdvisories(): Promise<Advisory[]>;
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  listExpertQueue(filters?: ReportFilters): Promise<PaginatedReports>;
  exportReports(filters?: ReportFilters): Promise<Blob>;
  getMonthlySummary(month?: string): Promise<MonthlyReportSummary>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  getPossibleRecentMatches(reportId: string): Promise<PossibleRecentMatches>;
  updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport>;
  recordReferral(
    reportId: string,
    input: ReportReferralInput,
  ): Promise<DiseaseReport>;
  recordExpertReferralResponse(
    reportId: string,
    input: ExpertReferralResponseInput,
  ): Promise<DiseaseReport>;
  linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport>;
}

