export const routes = {
  reports: "/reports",
  reportDetail: (reportId: string) => `/reports/${reportId}`,
} as const;
