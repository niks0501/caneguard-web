import type { QueryClient } from "@tanstack/react-query";
import { fieldValidationKeys } from "./fieldValidationQueries";
import { reportKeys } from "./reportQueries";
import { dashboardKeys } from "./useDashboard";

type ReportInvalidationOptions = {
  reportId?: string;
};

export function invalidateReportDependentQueries(
  queryClient: QueryClient,
  { reportId }: ReportInvalidationOptions = {},
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    queryClient.invalidateQueries({ queryKey: fieldValidationKeys.all }),
  ];

  if (reportId) {
    invalidations.unshift(
      queryClient.invalidateQueries({
        queryKey: reportKeys.detail(reportId),
        exact: true,
      }),
    );
  }

  return Promise.all(invalidations);
}
