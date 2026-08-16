export const routes = {
  login: "/login",
  dashboard: "/dashboard",
  reports: "/reports",
  map: "/map",
  reportDetail: (reportId: string) => `/reports/${reportId}`,
} as const;
