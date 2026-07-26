export const routes = {
  login: "/login",
  dashboard: "/dashboard",
  reports: "/reports",
  reportDetail: (reportId: string) => `/reports/${reportId}`,
} as const;
