import type { ReportFilters } from "../../domain/report.types";
import { sectionLabelForPath } from "../layout/navigationOrigin";

/** Snapshot the queue's order before a review can remove its current row. */
export interface ReviewQueueContext {
  returnTo: string;
  filters: ReportFilters;
  remainingIds: string[];
  reviewedIds: string[];
  /** One-based position within the originally loaded list, when known. */
  loadedPosition?: number;
  /** Non-report-list surfaces carry their exact displayed queue snapshot. */
  snapshotOnly?: boolean;
  /** The displayed snapshot stops before the server's authoritative total. */
  snapshotTruncated?: boolean;
}

/** Names where the back link goes: the page the review began on (To do, Field visits or Cases). */
export function returnLinkLabel(returnTo: string): string {
  const [path, query = ""] = returnTo.split("#")[0].split("?");
  return `Back to ${sectionLabelForPath(path, query) ?? "Cases"}`;
}

export function reviewQueueContext(value: unknown): ReviewQueueContext | null {
  if (!value || typeof value !== "object") return null;
  const context = (value as { reviewQueue?: ReviewQueueContext }).reviewQueue;
  if (!context || !/^\/(reports|monitoring|todo)(\?|$)/.test(context.returnTo)
    || !Array.isArray(context.remainingIds) || !Array.isArray(context.reviewedIds)
    || !context.filters || typeof context.filters !== "object") return null;
  return context;
}
