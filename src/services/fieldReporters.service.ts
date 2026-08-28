import { ApiFieldReportersRepository } from "../data/api/ApiFieldReportersRepository";
import type { FieldReportersRepository } from "../data/contracts/FieldReportersRepository";

export function createFieldReportersRepository(): FieldReportersRepository {
  return new ApiFieldReportersRepository();
}

export const fieldReportersRepository = createFieldReportersRepository();
