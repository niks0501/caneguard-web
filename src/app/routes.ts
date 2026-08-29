import type { FieldValidationQueue, OperationalQueue } from "../domain/operationalQueue";

export const routes = {
  login: "/login",
  dashboard: "/dashboard",
  reports: "/reports",
  map: "/map",
  reportQueue: (queue: OperationalQueue) => `/reports?queue=${queue}`,
  fieldValidationQueue: (queue: FieldValidationQueue) => `/map?queue=${queue}`,
  reportDetail: (reportId: string) => `/reports/${reportId}`,
} as const;
