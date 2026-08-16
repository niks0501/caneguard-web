import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { FieldValidationFilters } from "../domain/fieldValidation.types";
import { fieldValidationRepository } from "../services/fieldValidation.service";

export const fieldValidationKeys = {
  all: ["field-validation"] as const,
  map: (filters: FieldValidationFilters) =>
    [...fieldValidationKeys.all, "map", filters] as const,
  queue: (filters: FieldValidationFilters) =>
    [...fieldValidationKeys.all, "queue", filters] as const,
};

export const fieldValidationMapQueryOptions = (
  filters: FieldValidationFilters,
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: fieldValidationKeys.map(filters),
    queryFn: () => fieldValidationRepository.getMap(filters),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
  });

export const fieldValidationQueueQueryOptions = (
  filters: FieldValidationFilters,
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: fieldValidationKeys.queue(filters),
    queryFn: () => fieldValidationRepository.getQueue(filters),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
  });
