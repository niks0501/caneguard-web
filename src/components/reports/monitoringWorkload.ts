import type { FieldValidationFilters } from "../../domain/fieldValidation.types";

/**
 * The List schedule summary and the Visit Calendar both describe the same
 * global population: every active, open, incomplete field-validation visit.
 * The summary is deliberately not derived from List filters.
 */
export const activeVisitWorkloadFilters: FieldValidationFilters = {
  queue: "needs_visit",
  limit: 100,
};
