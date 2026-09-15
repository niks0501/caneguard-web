export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

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
