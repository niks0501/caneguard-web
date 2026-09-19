export const operationalQueueValues = [
  "needs_review",
  "needs_visit",
  "follow_up_due",
  "upcoming",
] as const;

export type OperationalQueue = (typeof operationalQueueValues)[number];

export type FieldValidationQueue = Exclude<OperationalQueue, "needs_review">;
