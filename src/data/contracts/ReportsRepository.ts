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
  DuplicateUnlinkInput,
  ReportReviewInput,
  HandoffNoteInput,
} from "../../domain/review.types";

export interface ReportsRepository {
  listAdvisories(): Promise<Advisory[]>;
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  exportReports(filters?: ReportFilters): Promise<Blob>;
  getMonthlySummary(month?: string): Promise<MonthlyReportSummary>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  /** Idempotent case-open stamp (Q8): first review only, never a form version bump. */
  openCase(reportId: string): Promise<{ firstReviewedAt: string | null }>;
  getPossibleRecentMatches(reportId: string): Promise<PossibleRecentMatches>;
  updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport>;
  recordHandoffNote(reportId: string, input: HandoffNoteInput): Promise<DiseaseReport>;
  linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport>;
  unlinkDuplicate(
    reportId: string,
    input: DuplicateUnlinkInput,
  ): Promise<DiseaseReport>;
}

