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
