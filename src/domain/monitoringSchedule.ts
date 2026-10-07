import type { FieldValidationQueueItem } from "./fieldValidation.types";

/**
 * Date-only schedule arithmetic for the Monitoring Register and Visit Calendar.
 *
 * The office classification of a visit is always the Asia/Manila office date
 * (`manilaDateAt`), never the browser or device date. Everything here works on
 * `YYYY-MM-DD` / `YYYY-MM` keys so a month grid, the schedule summary, and the
 * selected-day agenda agree regardless of the runtime timezone.
 */

const dateKeyPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isScheduleDateKey(value: string | null | undefined): value is string {
  if (!value || !dateKeyPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isScheduleMonthKey(value: string | null | undefined): value is string {
  return Boolean(value && monthKeyPattern.test(value));
}

export function scheduleMonthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function addScheduleDays(dateKey: string, days: number): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function shiftScheduleMonth(monthKey: string, amount: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ScheduleGridDay {
  key: string;
  dayNumber: number;
  inMonth: boolean;
}

/**
 * Monday-first month grid. Days from the previous or next month are returned as
 * inactive filler cells so every calendar row keeps a stable, full width.
 */
export function scheduleMonthGrid(monthKey: string): ScheduleGridDay[] {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const leading = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - leading + 1));
    return {
      key: date.toISOString().slice(0, 10),
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
  });
}

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function scheduleDateLabel(dateKey: string): string {
  return longDateFormatter.format(new Date(`${dateKey}T00:00:00.000Z`));
}

export function scheduleMonthLabel(monthKey: string): string {
  return monthFormatter.format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

export interface ScheduleSummaryCounts {
  overdue: number;
  today: number;
  next7Days: number;
  unscheduled: number;
}

/**
 * Global active-work counts. The population is the complete active visit
 * workload, so Register filters can never change these numbers.
 */
export function summarizeActiveWorkload(
  items: readonly FieldValidationQueueItem[],
  officeDate: string,
): ScheduleSummaryCounts {
  const windowStart = addScheduleDays(officeDate, 1);
  const windowEnd = addScheduleDays(officeDate, 7);
  const counts: ScheduleSummaryCounts = {
    overdue: 0,
    today: 0,
    next7Days: 0,
    unscheduled: 0,
  };

  for (const item of items) {
    const target = item.targetVisitDate ?? null;
    if (!target) {
      counts.unscheduled += 1;
    } else if (target < officeDate) {
      counts.overdue += 1;
    } else if (target === officeDate) {
      counts.today += 1;
    } else if (target >= windowStart && target <= windowEnd) {
      counts.next7Days += 1;
    }
  }

  return counts;
}

/** Frozen same-date ordering: observed_at, null observations last, submitted_at, identity. */
export function compareDayAgenda(
  left: FieldValidationQueueItem,
  right: FieldValidationQueueItem,
): number {
  if (left.observedAt && right.observedAt) {
    if (left.observedAt !== right.observedAt) return left.observedAt < right.observedAt ? -1 : 1;
  } else if (left.observedAt && !right.observedAt) {
    return -1;
  } else if (!left.observedAt && right.observedAt) {
    return 1;
  }

  if (left.submittedAt !== right.submittedAt) return left.submittedAt < right.submittedAt ? -1 : 1;
  if (left.uuid !== right.uuid) return left.uuid < right.uuid ? -1 : 1;
  return 0;
}

/** Undated active work stays out of dated cells; it is Unscheduled work only. */
export function groupScheduleByDate(
  items: readonly FieldValidationQueueItem[],
): Map<string, FieldValidationQueueItem[]> {
  const byDate = new Map<string, FieldValidationQueueItem[]>();

  for (const item of items) {
    const target = item.targetVisitDate ?? null;
    if (!target) continue;
    const bucket = byDate.get(target);
    if (bucket) bucket.push(item);
    else byDate.set(target, [item]);
  }

  for (const bucket of byDate.values()) bucket.sort(compareDayAgenda);
  return byDate;
}
