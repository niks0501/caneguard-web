import type { ReportFilters } from "../../domain/report.types";

/** Snapshot the queue's order before a review can remove its current row. */
export interface ReviewQueueContext {
  returnTo: string;
  filters: ReportFilters;
  remainingIds: string[];
  reviewedIds: string[];
  /** Non-report-list surfaces carry their exact displayed queue snapshot. */
  snapshotOnly?: boolean;
  /** The displayed snapshot stops before the server's authoritative total. */
  snapshotTruncated?: boolean;
}

export function reviewQueueContext(value: unknown): ReviewQueueContext | null {
  if (!value || typeof value !== "object") return null;
  const context = (value as { reviewQueue?: ReviewQueueContext }).reviewQueue;
  if (!context || !/^\/(reports|monitoring|needs-assessment)(\?|$)/.test(context.returnTo)
    || !Array.isArray(context.remainingIds) || !Array.isArray(context.reviewedIds)
    || !context.filters || typeof context.filters !== "object") return null;
  return context;
}
