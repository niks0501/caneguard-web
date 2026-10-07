import { useQuery } from "@tanstack/react-query";
import type { FieldValidationFilters } from "../domain/fieldValidation.types";
import {
  fieldValidationMapQueryOptions,
  fieldValidationQueueQueryOptions,
} from "./fieldValidationQueries";
import type { FieldValidationQueueQueryOptions } from "./fieldValidationQueries";

export function useFieldValidationMap(
  filters: FieldValidationFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery(fieldValidationMapQueryOptions(filters, options));
}

export function useFieldValidationQueue(
  filters: FieldValidationFilters,
  options: FieldValidationQueueQueryOptions = {},
) {
  return useQuery(fieldValidationQueueQueryOptions(filters, options));
}
