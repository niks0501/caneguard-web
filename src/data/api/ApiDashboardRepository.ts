import type { AxiosInstance } from "axios";
import { axiosClient } from "../../api/axiosClient";
import type { DashboardRepository } from "../contracts/DashboardRepository";
import type { DashboardSummary } from "../../domain/dashboard.types";
import { mapDashboard } from "./mappers/dashboard.mapper";
import { dashboardResponseSchema } from "./schemas/dashboard.schema";

export class ApiDashboardRepository implements DashboardRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async getSummary(): Promise<DashboardSummary> {
    const response = await this.client.get("/api/v1/dashboard/summary");
    return mapDashboard(dashboardResponseSchema.parse(response.data));
  }
}
