import { queryOptions } from "@tanstack/react-query";
import { fieldReportersRepository } from "../services/fieldReporters.service";

export const fieldReporterKeys = {
  all: ["field-reporters"] as const,
};

export const fieldReportersQueryOptions = () =>
  queryOptions({
    queryKey: fieldReporterKeys.all,
    queryFn: () => fieldReportersRepository.list(),
    staleTime: 5 * 60_000,
  });
