import { useMemo } from "react";
import { keepPreviousData, queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import {
  FIELD_SURVEYS_DEFAULT_LIMIT,
  type FieldSurveyBoundaryFeature,
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

export function useFieldSurveys(
  query: FieldSurveysQuery | number = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({ ...fieldSurveysQueryOptions(query), enabled: options.enabled ?? true });
}

/**
 * One boundary by its number, for a boundary older than the newest page the
 * viewer loads. The server search accepts a boundary id and returns one row.
 */
export function useFieldSurveyById(id: string | null) {
  const query = useQuery({
    ...fieldSurveysQueryOptions({ limit: 1, search: id ?? "" }),
    placeholderData: undefined,
    enabled: id !== null,
  });
  const feature = query.data?.features.find((item) => String(item.properties.id) === id) ?? null;
  return { query, feature };
}

const EMPTY_FEATURES: FieldSurveyBoundaryFeature[] = [];
const EMPTY_FEATURE_MAP = new Map<string, FieldSurveyBoundaryFeature>();

/**
 * Fetches multiple older-than-page boundaries by id in parallel so a case
 * with several linked plots displays every plot on the map.
 */
export function useFieldSurveysByIds(ids: string[]) {
  const uniqueIds = useMemo(() => {
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const id of ids) {
      const trimmed = id.trim();
      if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0 || seen.has(trimmed)) continue;
      seen.add(trimmed);
      valid.push(trimmed);
    }
    return valid;
  }, [ids]);

  return useQueries({
    queries: uniqueIds.map((id) => ({
      ...fieldSurveysQueryOptions({ limit: 1, search: id }),
      placeholderData: undefined,
    })),
    combine: (queries) => {
      const featuresById = new Map<string, FieldSurveyBoundaryFeature>();
      uniqueIds.forEach((id, index) => {
        const feature = queries[index]?.data?.features.find((item) => String(item.properties.id) === id);
        if (feature) featuresById.set(id, feature);
      });
      return {
        queries,
        featuresById: featuresById.size === 0 ? EMPTY_FEATURE_MAP : featuresById,
        features: featuresById.size === 0 ? EMPTY_FEATURES : Array.from(featuresById.values()),
        isFetching: queries.some((query) => query.isFetching),
        isPending: queries.some((query) => query.isPending),
        isError: queries.some((query) => query.isError),
      };
    },
  });
}
