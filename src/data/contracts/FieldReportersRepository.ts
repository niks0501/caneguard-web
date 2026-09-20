import type { FieldReporter } from "../../domain/fieldValidation.types";

export interface FieldReportersRepository {
  list(): Promise<FieldReporter[]>;
}
