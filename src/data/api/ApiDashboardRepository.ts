import type { AxiosInstance } from "axios";
import { axiosClient } from "../../api/axiosClient";
import type {
  DashboardRepository,
  DashboardSummaryOptions,
} from "../contracts/DashboardRepository";
import type {
  DashboardSummary,
  ReportAnalytics,
  ReportAnalyticsParams,
} from "../../domain/dashboard.types";
import { mapDashboard, mapReportAnalytics } from "./mappers/dashboard.mapper";
import {
  analyticsResponseSchema,
  type AnalyticsParams,
} from "./schemas/analytics.schema";
import { dashboardResponseSchema } from "./schemas/dashboard.schema";

export class ApiDashboardRepository implements DashboardRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async getSummary(month?: string, options?: DashboardSummaryOptions): Promise<DashboardSummary> {
    const response = await this.client.get("/api/v1/dashboard/summary", {
      params: {
        ...(month ? { month } : {}),
        ...(options?.include ? { include: options.include } : {}),
        ...(options?.recentLimit ? { recent_limit: options.recentLimit } : {}),
      },
    });
    return mapDashboard(dashboardResponseSchema.parse(response.data));
  }

  async getAnalytics(params: ReportAnalyticsParams): Promise<ReportAnalytics> {
    const query: AnalyticsParams = {
      from: params.from,
      to: params.to,
      ...(params.granularity ? { granularity: params.granularity } : {}),
    };
    const response = await this.client.get("/api/v1/reports/analytics", {
      params: query,
    });
    return mapReportAnalytics(analyticsResponseSchema.parse(response.data));
  }
}
