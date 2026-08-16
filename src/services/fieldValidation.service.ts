import { env } from "../config/env";
import { ApiFieldValidationRepository } from "../data/api/ApiFieldValidationRepository";
import type { FieldValidationRepository } from "../data/contracts/FieldValidationRepository";
import { MockFieldValidationRepository } from "../data/mock/MockFieldValidationRepository";

export function createFieldValidationRepository(
  dataSource: "api" | "mock" = env.dataSource,
): FieldValidationRepository {
  return dataSource === "mock"
    ? new MockFieldValidationRepository()
    : new ApiFieldValidationRepository();
}

export const fieldValidationRepository = createFieldValidationRepository();
