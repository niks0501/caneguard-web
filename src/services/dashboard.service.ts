import { env, mockDataAvailable } from "../config/env";
import { ApiDashboardRepository } from "../data/api/ApiDashboardRepository";
import type { DashboardRepository } from "../data/contracts/DashboardRepository";
import { MockDashboardRepository } from "../data/mock/MockDashboardRepository";

export function createDashboardRepository(
  dataSource: "api" | "mock" = env.dataSource,
): DashboardRepository {
  return mockDataAvailable && dataSource === "mock"
    ? new MockDashboardRepository()
    : new ApiDashboardRepository();
}

export const dashboardRepository = createDashboardRepository();
