import type { DashboardSummary } from "../../domain/dashboard.types";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The one calm Today sentence, read from the queue counts the page already
 * loads. The most pressing item wins: a past-target-date visit, then reports
 * waiting for review, then visits still needed, then nothing.
 */
export function morningNote(queues: DashboardSummary["queues"]): string {
  if (queues.follow_up_due > 0) {
    return `${plural(queues.follow_up_due, "field visit is", "field visits are")} past the target date.`;
  }
  if (queues.needs_review > 0) {
    return `${plural(queues.needs_review, "report is", "reports are")} waiting for your review.`;
  }
  if (queues.needs_visit > 0) {
    return `${plural(queues.needs_visit, "report needs", "reports need")} a field visit.`;
  }
  return "Nothing needs you.";
}
