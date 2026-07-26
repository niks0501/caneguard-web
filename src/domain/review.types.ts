import type { ReviewStatus } from "./report.types";

export interface ReportReviewInput {
  status: Exclude<ReviewStatus, "submitted_unverified">;
  notes: string;
}
