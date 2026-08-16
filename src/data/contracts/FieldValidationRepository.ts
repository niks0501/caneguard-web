import type {
  FieldValidationFilters,
  FieldValidationMapData,
  FieldValidationQueueData,
} from "../../domain/fieldValidation.types";

export interface FieldValidationRepository {
  getMap(filters?: FieldValidationFilters): Promise<FieldValidationMapData>;
  getQueue(filters?: FieldValidationFilters): Promise<FieldValidationQueueData>;
}
