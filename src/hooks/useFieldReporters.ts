import { useQuery } from "@tanstack/react-query";
import { fieldReportersQueryOptions } from "./fieldReporterQueries";

export function useFieldReporters() {
  return useQuery(fieldReportersQueryOptions());
}
