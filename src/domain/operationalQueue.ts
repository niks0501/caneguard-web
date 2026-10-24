export const operationalQueueValues = [
  "needs_review",
  "needs_visit",
  "follow_up_due",
  "upcoming",
  "unverified_no_active_work",
] as const;

export type OperationalQueue = (typeof operationalQueueValues)[number];

/** The Map is a field-validation surface, so it only accepts these queues. */
export const fieldValidationQueueValues = [
  "needs_visit",
  "follow_up_due",
  "upcoming",
] as const satisfies readonly OperationalQueue[];

export type FieldValidationQueue = (typeof fieldValidationQueueValues)[number];
