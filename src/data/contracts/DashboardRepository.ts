import type {
  DashboardSummary,
  ReportAnalytics,
  ReportAnalyticsParams,
} from "../../domain/dashboard.types";

export interface DashboardRepository {
  getSummary(month?: string): Promise<DashboardSummary>;
  getAnalytics(params: ReportAnalyticsParams): Promise<ReportAnalytics>;
}
