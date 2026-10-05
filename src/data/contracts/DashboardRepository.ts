import type {
  DashboardSummary,
  ReportAnalytics,
  ReportAnalyticsParams,
} from "../../domain/dashboard.types";

export interface DashboardSummaryOptions {
  /** Payload split (overhaul P1): slices after the always-present counts. */
  include?: string;
  recentLimit?: number;
}

export interface DashboardRepository {
  getSummary(month?: string, options?: DashboardSummaryOptions): Promise<DashboardSummary>;
  getAnalytics(params: ReportAnalyticsParams): Promise<ReportAnalytics>;
}
