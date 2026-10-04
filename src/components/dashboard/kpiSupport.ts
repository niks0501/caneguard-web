import type { ReportAnalytics } from "../../domain/dashboard.types";
import { formatWindow } from "./dashboardScope";

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

export const UNVERIFIED_SUPPORT_LINE = "No validation underway";
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
 * The definition behind KPI 1's bare "vs previous period" figure.
 *
 * The retired header note defined the comparison as "the same calendar dates
 * in the prior month" and sat beside the scope ruler. That wording no longer
 * matched the API after the period-comparison fix, which pairs this scope with
 * the same number of days immediately *before* it, so the one dashboard
 * tooltip states the real rule and the window the request returned.
 */
export function comparisonWindowTooltip(from: string, to: string): string {
  return `Previous period: the same number of days immediately before this scope, ${formatWindow(from, to)}.`;
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
  return `${count} unverified ${count === 1 ? "report" : "reports"} with no validation underway`;
}
