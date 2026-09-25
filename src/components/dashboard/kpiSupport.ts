import type { ReportAnalytics } from "../../domain/dashboard.types";

/**
 * Supporting lines for the four current-operations KPI cards (overhaul §3.2).
 *
 * One figure per card, always read from the population and window the card
 * already shows: KPI 1's delta pairs the scoped period with the comparison
 * window the API returned for that same request, KPI 2's oldest wait comes
 * from the review backlog that produces the card's value, and KPI 3's
 * past-target count is the calendar subset of the same current-state queue.
 * A figure that cannot be derived is named as unavailable instead of printed
 * as a zero, and a window that stops at today says so rather than reading as a
 * finished month.
 */

export const UNVERIFIED_SUPPORT_LINE = "No validation or referral underway";
export const COMPARISON_UNAVAILABLE = "Previous period unavailable";
export const WAITING_AGE_UNAVAILABLE = "Waiting age unavailable";
export const OLDEST_WAIT_UNAVAILABLE = "Oldest waiting age unavailable";
export const NOTHING_WAITING = "No reports awaiting review";

/** One signed delta line, labelled month to date while the window is open. */
export function deltaSupportLine(delta: number, monthToDate: boolean): string {
  const line =
    delta === 0
      ? "No change vs previous period"
      : `${delta > 0 ? "+" : ""}${delta} vs previous period`;
  return monthToDate ? `${line} · month to date` : line;
}

/**
 * Oldest waiting age over the same review backlog the card counts. A backlog
 * with nothing waiting has no oldest age, and records without a measured wait
 * leave the age unavailable rather than zero.
 */
export function waitingAgeSupportLine(
  backlog: ReportAnalytics["reviewBacklog"] | undefined,
): string {
  if (!backlog) return WAITING_AGE_UNAVAILABLE;
  if (backlog.totalWaiting === 0) return NOTHING_WAITING;
  if (backlog.oldestWaitingDays === null) return OLDEST_WAIT_UNAVAILABLE;
  const days = backlog.oldestWaitingDays;
  return `Oldest: ${days} ${days === 1 ? "day" : "days"}`;
}

/** Calendar subset of the field-validation queue the card counts. */
export function pastTargetDateSupportLine(count: number): string {
  return `${count} past target date`;
}

/** Accessible name for KPI 4's status indicator, carrying its counted state. */
export function noActiveWorkGraphicName(count: number): string {
  return `${count} unverified ${count === 1 ? "report" : "reports"} with no validation or referral underway`;
}
