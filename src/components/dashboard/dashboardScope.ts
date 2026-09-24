import { manilaDateAt } from "../../domain/reportingTime";

/**
 * Single page-scope ruler for the analytical dashboard (overhaul §3.1, §4,
 * decision Q1). One control scopes KPI 1, C1, C2, C3, the map and the
 * recent-reports window. Point-in-time cards (KPIs 2–4) say so on the card
 * instead of silently ignoring the ruler.
 */

export type ScopeMode = "month" | "last30" | "custom";

export interface DashboardScope {
  mode: ScopeMode;
  /** PHT calendar month feeding the dashboard summary request. */
  month: string;
  /** Inclusive PHT from/to dates feeding the analytics request. */
  from: string;
  to: string;
  granularity: "day" | "week";
}

export interface ScopeSelection {
  mode: ScopeMode;
  month: string;
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function shiftDateString(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function dateDifferenceInDays(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
}

export function monthBounds(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const last = String(lastDay).padStart(2, "0");
  return { from: `${month}-01`, to: `${month}-${last}` };
}

/** Resolve a scope selection into concrete summary + analytics windows. */
export function resolveScope(
  selection: ScopeSelection,
  today: string = manilaDateAt(),
): DashboardScope {
  if (selection.mode === "month") {
    const { from, to } = monthBounds(selection.month);
    return {
      mode: "month",
      month: selection.month,
      from,
      to,
      granularity: "day",
    };
  }
  if (selection.mode === "last30") {
    const to = today;
    const from = shiftDateString(to, -29);
    return {
      mode: "last30",
      month: to.slice(0, 7),
      from,
      to,
      granularity: "day",
    };
  }
  const from = selection.from <= selection.to ? selection.from : selection.to;
  const to = selection.from <= selection.to ? selection.to : selection.from;
  const days = dateDifferenceInDays(from, to) + 1;
  return {
    mode: "custom",
    month: to.slice(0, 7),
    from,
    to,
    granularity: days > 62 ? "week" : "day",
  };
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dayMonthYear(date: string): { day: number; month: string; year: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { day, month: MONTH_NAMES[month - 1], year };
}

/** "2026-09-01".."2026-09-24" → "1–24 Sep 2026" (PHT calendar dates). */
export function formatWindow(from: string, to: string): string {
  const start = dayMonthYear(from);
  const end = dayMonthYear(to);
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${end.month} ${end.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
  }
  return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
}

/** "21:14:03" 24-hour PHT wall time for freshness stamps. */
export function formatAsOfTime(timestamp: number): string {
  if (!timestamp) return "Not refreshed yet";
  const manila = new Date(timestamp + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}:${pad(manila.getUTCSeconds())}`;
}
