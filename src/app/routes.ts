import type { FieldValidationQueue } from "../domain/operationalQueue";

export type TodoLane = "review" | "send" | "overdue" | "decide";

export const routes = {
  home: "/",
  guide: "/guide",
  guideEntry: (entryId: string) => `/guide/${encodeURIComponent(entryId)}`,
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
  fieldMapForCase: (reportId: string, boundaryId?: string | number | null) => {
    const base = `/monitoring?view=boundaries&report=${encodeURIComponent(reportId)}`;
    const hasBoundary = typeof boundaryId === "number" ? boundaryId > 0 : typeof boundaryId === "string" && boundaryId !== "";
    return hasBoundary ? `${base}&boundary=${encodeURIComponent(String(boundaryId))}` : base;
  },
  monitoringMapForReport: (reportId: string) => `/monitoring?view=map&report=${encodeURIComponent(reportId)}`,
  dashboardTab: (tab: "today" | "trends") => (tab === "trends" ? "/dashboard?tab=trends" : "/dashboard"),
  reportDecision: (reportId: string) => `/reports/${reportId}#review-decision`,
  fieldValidationQueue: (queue: FieldValidationQueue) => `/monitoring?view=map&queue=${queue}`,
  reportDetail: (reportId: string) => `/reports/${reportId}`,
  farmerRequests: "/farmer-requests",
  accounts: "/accounts",
  accountDetail: (uuid: string) => `/accounts/${encodeURIComponent(uuid)}`,
  settings: "/settings",
  settingsSection: (section: string) => `/settings/${section}`,
  reportApproval: "/report-approval",
  adminSettings: "/admin-settings",
  farmerBroadcasts: "/farmer-broadcasts",
} as const;
