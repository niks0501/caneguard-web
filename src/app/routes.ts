import type { FieldValidationQueue, OperationalQueue } from "../domain/operationalQueue";

export const routes = {
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  expertQueue: "/expert/queue",
  reports: "/reports",
  monitoring: "/monitoring",
  map: "/map",
  reportQueue: (queue: OperationalQueue) => `/reports?queue=${queue}`,
  fieldValidationQueue: (queue: FieldValidationQueue) => `/map?queue=${queue}`,
  reportDetail: (reportId: string) => `/reports/${reportId}`,
  settings: "/settings",
} as const;
