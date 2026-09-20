export const operationalQueueValues = [
  "needs_review",
  "needs_visit",
  "follow_up_due",
  "upcoming",
  "unverified_no_active_work",
] as const;

export type OperationalQueue = (typeof operationalQueueValues)[number];

export type FieldValidationQueue = Exclude<OperationalQueue, "needs_review" | "unverified_no_active_work">;
