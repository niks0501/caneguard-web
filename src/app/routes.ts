import type { FieldValidationQueue, OperationalQueue } from "../domain/operationalQueue";

export const routes = {
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  expertQueue: "/expert/queue",
  expertReportDetail: (reportId: string) => `/expert/queue/${reportId}`,
  reports: "/reports",
  monitoring: "/monitoring",
  needsAssessment: "/needs-assessment",
  fieldOperations: "/monitoring?view=field-operations",
  fieldOperationsForReport: (reportId: string) => `/monitoring?view=field-operations&report=${encodeURIComponent(reportId)}`,
  map: "/map",
  reportQueue: (queue: OperationalQueue) => `/reports?queue=${queue}`,
  fieldValidationQueue: (queue: FieldValidationQueue) => `/map?queue=${queue}`,
  reportDetail: (reportId: string) => `/reports/${reportId}`,
  settings: "/settings",
} as const;
