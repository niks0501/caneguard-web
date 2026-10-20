import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { FIELD_SURVEYS_DEFAULT_LIMIT } from "../domain/fieldSurvey.types";
import { fieldSurveysRepository } from "../services/fieldSurveys.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const fieldSurveysKeys = {
  all: ["field-surveys"] as const,
  list: (limit: number) => [...fieldSurveysKeys.all, limit] as const,
};

export const fieldSurveysQueryOptions = (limit = FIELD_SURVEYS_DEFAULT_LIMIT) =>
  queryOptions({
    queryKey: fieldSurveysKeys.list(limit),
    queryFn: () => fieldSurveysRepository.listFieldSurveys(limit),
    placeholderData: keepPreviousData,
    ...getOperationalQueryRefreshOptions(),
  });

export function useFieldSurveys(limit = FIELD_SURVEYS_DEFAULT_LIMIT) {
  return useQuery(fieldSurveysQueryOptions(limit));
}
