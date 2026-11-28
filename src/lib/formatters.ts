export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

/** Calendar-day strings (YYYY-MM-DD) as "Jul 22, 2026"; no timezone shift. */
export const formatCalendarDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

/** Server prose keeps its values; each calendar-day token in it is shown as "Jul 22, 2026". */
export const formatCalendarDaysInText = (text: string) =>
  text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (token) =>
    Number.isNaN(new Date(token).getTime()) ? token : formatCalendarDate(token));

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

/**
 * Generic area formatter (e.g. total plot area or any confirmed hectare figure).
 * Ordinary values keep up to two decimals; small positive areas (0 < v < 0.01 ha)
 * keep 3–4+ decimals so a 40 m² patch renders as `0.004 ha`, never `0.00 ha`.
 * Confirmed zero renders as `0 ha`.
 */
export function formatAreaHectares(
  hectares: number | null | undefined,
  fallback = "—",
): string {
  if (typeof hectares !== "number" || !Number.isFinite(hectares)) return fallback;
  if (hectares === 0) return "0 ha";

  const abs = Math.abs(hectares);
  const fractionDigits = abs > 0 && abs < 0.01 ? Math.max(4, Math.ceil(-Math.log10(abs)) + 1) : 2;
  const options: Intl.NumberFormatOptions = fractionDigits <= 20
    ? { maximumFractionDigits: Math.max(2, fractionDigits) }
    : { notation: "scientific", maximumSignificantDigits: 3 };
  const formatted = new Intl.NumberFormat("en-PH", options).format(hectares);

  return `${formatted} ha`;
}

/**
 * Tri-state measured-area formatter distinguishing unmeasured ("Not measured"),
 * confirmed zero ("0 ha"), and measured positive values (preserving precision
 * for 0 < v < 0.01 ha).
 */
export function formatMeasuredArea(
  hectares: number | null | undefined,
  measurement?: "measured" | "not_measured" | null,
  options?: { unmeasuredLabel?: string; zeroLabel?: string },
): string {
  const unmeasuredLabel = options?.unmeasuredLabel ?? "Not measured";
  if (measurement === "not_measured") return unmeasuredLabel;
  if (typeof hectares !== "number" || !Number.isFinite(hectares)) return unmeasuredLabel;
  if (hectares === 0) return options?.zeroLabel ?? "0 ha";

  return formatAreaHectares(hectares, unmeasuredLabel);
}

/**
 * Tri-state percentage formatter distinguishing unmeasured ("Not measured"),
 * confirmed zero ("0%"), sub-0.01% positive patches ("<0.01%"), and measured percentages.
 */
export function formatMeasuredPercent(
  percent: number | null | undefined,
  measurement?: "measured" | "not_measured" | null,
  options?: { unmeasuredLabel?: string; positiveArea?: boolean },
): string {
  const unmeasuredLabel = options?.unmeasuredLabel ?? "Not measured";
  if (measurement === "not_measured") return unmeasuredLabel;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return unmeasuredLabel;
  if (percent === 0) return options?.positiveArea ? "<0.01%" : "0%";
  if (percent > 0 && percent < 0.01) return "<0.01%";

  const formatted = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(percent);
  return `${formatted}%`;
}

/**
 * Compact affected-area label for dense table cells, using an em dash when
 * unmeasured so an unmeasured case never reads as zero.
 */
export function formatAffectedArea(
  hectares: number | null | undefined,
  measurement?: "measured" | "not_measured" | null,
): string {
  return formatMeasuredArea(hectares, measurement, { unmeasuredLabel: "—" });
}
