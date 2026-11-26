const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Return a calendar date for an instant in Asia/Manila (UTC+8, no DST). */
export function manilaDateAt(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + MANILA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Return the Asia/Manila calendar month containing an instant. */
export function manilaMonthAt(now: Date = new Date()): string {
  return manilaDateAt(now).slice(0, 7);
}

/** Return the preceding complete ISO week, resolved from the Manila date. */
export function previousManilaIsoWeekAt(now: Date = new Date()): string {
  const monday = new Date(`${manilaDateAt(now)}T00:00:00.000Z`);
  const weekday = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - weekday - 6);

  const thursday = new Date(monday.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstMonday = new Date(Date.UTC(isoYear, 0, 4));
  const firstMondayWeekday = firstMonday.getUTCDay() || 7;
  firstMonday.setUTCDate(firstMonday.getUTCDate() - firstMondayWeekday + 1);
  const week = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Return the last `count` complete ISO weeks, newest first, resolved from the Manila date. */
export function recentManilaIsoWeeks(count: number, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => previousManilaIsoWeekAt(new Date(now.getTime() - index * 7 * DAY_MS)));
}

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO week (YYYY-Www) as a readable Mon–Sun date range (e.g. "Nov 16 – Nov 22"). */
export function isoWeekDateRangeLabel(week: string, includeYear = false): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return week;
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() + ((isoWeek - 1) * 7 - (jan4Weekday - 1)) * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);

  const startText = `${shortMonths[monday.getUTCMonth()]} ${monday.getUTCDate()}`;
  const endText = `${shortMonths[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`;
  return includeYear ? `${startText} – ${endText}, ${sunday.getUTCFullYear()}` : `${startText} – ${endText}`;
}
