import type { FieldValidationQueue } from "../domain/operationalQueue";

export type TodoLane = "review" | "send" | "overdue" | "decide";

export const routes = {
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  reports: "/reports",
  printableReports: "/reports/print",
  monitoring: "/monitoring",
  todo: "/todo",
  todoLane: (lane: TodoLane) => `/todo#lane-${lane}`,
  fieldOperations: "/monitoring?view=field-operations",
  fieldOperationsForReport: (reportId: string) => `/monitoring?view=field-operations&report=${encodeURIComponent(reportId)}`,
  reportDecision: (reportId: string) => `/reports/${reportId}#review-decision`,
  map: "/map",
  fieldValidationQueue: (queue: FieldValidationQueue) => `/map?queue=${queue}`,
  reportDetail: (reportId: string) => `/reports/${reportId}`,
  accounts: "/accounts",
  accountDetail: (uuid: string) => `/accounts/${encodeURIComponent(uuid)}`,
  settings: "/settings",
  reportApproval: "/report-approval",
  adminSettings: "/admin-settings",
} as const;
