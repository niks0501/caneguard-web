import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import {
  FIELD_SURVEYS_DEFAULT_LIMIT,
  type FieldSurveysQuery,
} from "../domain/fieldSurvey.types";
import { fieldSurveysRepository } from "../services/fieldSurveys.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const fieldSurveysKeys = {
  all: ["field-surveys"] as const,
  query: (query: Required<Pick<FieldSurveysQuery, "limit" | "page">> & { search: string }) =>
    [...fieldSurveysKeys.all, query] as const,
};

export function normalizeFieldSurveysQuery(
  query: FieldSurveysQuery | number = {},
): Required<Pick<FieldSurveysQuery, "limit" | "page">> & { search: string } {
  const resolved = typeof query === "number" ? { limit: query } : query;
  return {
    limit: resolved.limit ?? FIELD_SURVEYS_DEFAULT_LIMIT,
    page: Math.max(1, resolved.page ?? 1),
    search: resolved.search?.trim() ?? "",
  };
}

export const fieldSurveysQueryOptions = (query: FieldSurveysQuery | number = {}) => {
  const normalized = normalizeFieldSurveysQuery(query);
  return queryOptions({
    queryKey: fieldSurveysKeys.query(normalized),
    queryFn: () => fieldSurveysRepository.listFieldSurveys(normalized),
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });
};

export function useFieldSurveys(query: FieldSurveysQuery | number = {}) {
  return useQuery(fieldSurveysQueryOptions(query));
}
