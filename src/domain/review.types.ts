import type {
  AuthorityClassifiedCondition,
  ReviewStatus,
} from "./report.types";

export interface ReportReviewInput {
  status: Exclude<ReviewStatus, "submitted_unverified">;
  notes: string;
  authorityClassifiedCondition: AuthorityClassifiedCondition | null;
  expectedVersion: number;
}
