import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type {
  FieldValidationFilters,
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../domain/fieldValidation.types";
import { fieldValidationRepository } from "../services/fieldValidation.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const fieldValidationKeys = {
  all: ["field-validation"] as const,
  map: (filters: FieldValidationFilters) =>
    [...fieldValidationKeys.all, "map", filters] as const,
  queue: (filters: FieldValidationFilters) =>
    [...fieldValidationKeys.all, "queue", filters] as const,
};

export interface FieldValidationQueueQueryOptions {
  enabled?: boolean;
  /**
   * Load every server page of the queue instead of one page. The Monitoring
   * schedule surfaces need the complete visible workload before presenting a
   * month or a global summary as complete.
   */
  complete?: boolean;
}

/** A month must never be silently truncated; the bound only guards a runaway loop. */
const maximumSchedulePages = 200;

async function fetchCompleteQueue(
  filters: FieldValidationFilters,
): Promise<FieldValidationQueueData> {
  const limit = filters.limit ?? 100;
  const collected: FieldValidationQueueItem[] = [];

  for (let page = 1; page <= maximumSchedulePages; page += 1) {
    const data = await fieldValidationRepository.getQueue({ ...filters, limit, page });
    collected.push(...data.items);
    const total = data.total ?? collected.length;

    if (data.items.length === 0 && collected.length < total) {
      throw new Error("The schedule service returned an incomplete page of visits.");
    }
    if (collected.length >= total || data.items.length === 0) {
      return { ...data, items: collected, count: total, total, page: 1, perPage: limit };
    }
  }

  throw new Error("The complete visit schedule exceeds the supported month size.");
}

export const fieldValidationMapQueryOptions = (
  filters: FieldValidationFilters,
  options: { enabled?: boolean } = {},
) =>
  queryOptions({
    queryKey: fieldValidationKeys.map(filters),
    queryFn: () => fieldValidationRepository.getMap(filters),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });

export const fieldValidationQueueQueryOptions = (
  filters: FieldValidationFilters,
  options: FieldValidationQueueQueryOptions = {},
) =>
  queryOptions({
    queryKey: [
      ...fieldValidationKeys.queue(filters),
      options.complete ? "complete" : "page",
    ] as const,
    queryFn: () =>
      options.complete
        ? fetchCompleteQueue(filters)
        : fieldValidationRepository.getQueue(filters),
    enabled: options.enabled,
    // A complete-workload read must surface its explicit failure state instead
    // of holding a stale view through the transient retry window.
    ...(options.complete ? { retry: false } : {}),
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });
