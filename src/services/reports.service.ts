import { env, mockDataAvailable } from "../config/env";
import { ApiReportsRepository } from "../data/api/ApiReportsRepository";
import type { ReportsRepository } from "../data/contracts/ReportsRepository";
import { MockReportsRepository } from "../data/mock/MockReportsRepository";

export function createReportsRepository(
  dataSource: "api" | "mock" = env.dataSource,
): ReportsRepository {
  return mockDataAvailable && dataSource === "mock"
    ? new MockReportsRepository()
    : new ApiReportsRepository();
}

export const reportsRepository = createReportsRepository();
