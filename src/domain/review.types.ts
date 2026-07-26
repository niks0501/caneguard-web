import type { ReviewStatus } from "./report.types";

export interface ReportReviewInput {
  status: Exclude<ReviewStatus, "pending_review">;
  notes: string;
  reviewedBy: string;
}
