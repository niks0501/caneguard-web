import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import type { ExpertDirectoryEntry } from "../../domain/review.types";
import type {
  Advisory,
  DiseaseReport,
  ExpertConsultPacket,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  ConsultInvite,
  ConfirmExpertReferralInput,
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ExpertFindingInput,
  ExpertReferralResponseInput,
  ReportReferralInput,
  ReportReviewInput,
} from "../../domain/review.types";

export interface ReportsRepository {
  listAdvisories(): Promise<Advisory[]>;
  listExperts(): Promise<ExpertDirectoryEntry[]>;
  listReports(filters?: ReportFilters): Promise<PaginatedReports>;
  listExpertQueue(filters?: ReportFilters): Promise<PaginatedReports>;
  exportReports(filters?: ReportFilters): Promise<Blob>;
  getMonthlySummary(month?: string): Promise<MonthlyReportSummary>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  getExpertConsult(reportId: string): Promise<ExpertConsultPacket>;
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
  recordExpertFinding(
    reportId: string,
    input: ExpertFindingInput,
  ): Promise<DiseaseReport>;
  confirmExpertReferral(
    reportId: string,
    input: ConfirmExpertReferralInput,
  ): Promise<DiseaseReport>;
  issueConsultInvite(
    reportId: string,
    shareFullContext?: boolean,
  ): Promise<ConsultInvite>;
  revokeConsultInvite(reportId: string): Promise<ConsultInvite>;
  linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport>;
  unlinkDuplicate(
    reportId: string,
    input: DuplicateUnlinkInput,
  ): Promise<DiseaseReport>;
}

