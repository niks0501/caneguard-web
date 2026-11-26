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
  /** Adds to the shared office library; the advisory can be sent at once. */
  createAdvisory(input: AdvisoryInput): Promise<Advisory>;
  /** Edits wording in place; wording already sent to a case stays as it was. */
  updateAdvisory(advisoryUuid: string, input: AdvisoryUpdateInput): Promise<Advisory>;
  /** Removes an unused advisory for good, or archives one that cases have used. */
  deleteAdvisory(advisoryUuid: string): Promise<AdvisoryDeleteResult>;
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  exportReports(filters?: ReportFilters): Promise<Blob>;
  getMonthlySummary(month?: string): Promise<MonthlyReportSummary>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  /** Idempotent case-open stamp (Q8): first review only, never a form version bump. */
  openCase(reportId: string): Promise<{ firstReviewedAt: string | null }>;
  /**
   * Claim or renew the review lease. Resolves false when another reviewer holds
   * it; the caller re-reads the case to learn who. Admins may pass takeover.
   */
  claimReview(reportId: string, options?: { takeover?: boolean }): Promise<boolean>;
  /**
   * Release the caller's own lease; a no-op for anyone else's. A note is kept
   * for whoever continues the case.
   */
  releaseReview(reportId: string, note?: string): Promise<void>;
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
  updateAffectedFields(
    reportId: string,
    input: UpdateAffectedFieldsInput,
  ): Promise<UpdateAffectedFieldsResult>;
  /** Experimental aerial canopy check; supporting evidence only. */
  addAerialAnalysis(reportId: string, image: File): Promise<AerialAnalysis>;
  removeAerialAnalysis(reportId: string, analysisUuid: string): Promise<{ removalId: string }>;
  /** Undoes the named removal; the check returns to the case. */
  restoreAerialAnalysis(reportId: string, analysisUuid: string, removalId: string): Promise<AerialAnalysis>;
  getAerialMask(maskUrl: string): Promise<Blob>;
}

