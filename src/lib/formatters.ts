export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

/**
 * Operational times are Asia/Manila wall time (UTC+8, no DST) shown in
 * 12-hour form with an explicit meridiem marker. Never 24-hour: a bare
 * "21:14" is unreadable to the district-office staff who read this screen.
 * The timezone itself is named once on the dashboard (see
 * `DASHBOARD_TIMEZONE_LABEL`), never repeated per component.
 */
export const MANILA_TIME_ZONE = "Asia/Manila";

const manilaClock = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: MANILA_TIME_ZONE,
});

const manilaClockWithSeconds = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: MANILA_TIME_ZONE,
});

const manilaDateTime = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: MANILA_TIME_ZONE,
});

/** "9:14 PM" — 12-hour PHT clock time for stamps inside a sentence. */
export const formatClockTime = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : manilaClock.format(date);
};

/** "9:14:03 PM" — freshness stamps keep seconds so a refresh is visible. */
export const formatClockTimeWithSeconds = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : manilaClockWithSeconds.format(date);
};

/** "Jul 18, 2026, 9:16 AM" — PHT date and 12-hour time on one line. */
export const formatDateTime = (value: string) =>
  manilaDateTime.format(new Date(value));

export const formatConfidence = (confidence: number) =>
  new Intl.NumberFormat("en-PH", { style: "percent", maximumFractionDigits: 0 }).format(
    confidence,
  );

/**
 * Operational age wording for a work queue. Older submissions read as more
 * urgent than a fresh one, so the queue states elapsed time next to the date.
 */
export function formatAge(value: string, now: Date = new Date()) {
  const submitted = new Date(value);
  if (Number.isNaN(submitted.getTime())) return "";

  const elapsedDays = Math.floor(
    (now.getTime() - submitted.getTime()) / 86_400_000,
  );

  if (elapsedDays <= 0) return "Today";
  if (elapsedDays === 1) return "1 day ago";
  if (elapsedDays < 30) return `${elapsedDays} days ago`;

  const months = Math.floor(elapsedDays / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** Due wording for the active field-validation assignment. */
export function formatDueState(
  followUp: { dueOn: string | null; overdue: boolean } | undefined,
) {
  if (!followUp?.dueOn) return null;

  const dueDate = new Date(`${followUp.dueOn}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return null;

  return {
    label: formatDate(dueDate.toISOString()),
    overdue: followUp.overdue,
  };
}
