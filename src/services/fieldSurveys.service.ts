import { env } from "../config/env";
import { ApiFieldSurveysRepository } from "../data/api/ApiFieldSurveysRepository";
import type { FieldSurveysRepository } from "../data/contracts/FieldSurveysRepository";
import { MockFieldSurveysRepository } from "../data/mock/MockFieldSurveysRepository";

export function createFieldSurveysRepository(
  dataSource: "api" | "mock" = env.dataSource,
): FieldSurveysRepository {
  return dataSource === "mock"
    ? new MockFieldSurveysRepository()
    : new ApiFieldSurveysRepository();
}

export const fieldSurveysRepository = createFieldSurveysRepository();
