import type { AxiosInstance } from "axios";
import { axiosClient } from "../../api/axiosClient";
import type {
  FieldValidationFilters,
  FieldValidationMapData,
  FieldValidationQueueData,
} from "../../domain/fieldValidation.types";
import type { FieldValidationRepository } from "../contracts/FieldValidationRepository";
import {
  mapFieldValidationMap,
  mapFieldValidationQueue,
} from "./mappers/fieldValidation.mapper";
import {
  fieldValidationQueueResponseSchema,
  mapResponseSchema,
} from "./schemas/fieldValidation.schema";

function toQueryParams(
  filters: FieldValidationFilters = {},
  includeStatus = true,
) {
  return {
    queue: filters.queue,
    status: includeStatus ? filters.status : undefined,
    predicted_label: filters.disease,
    barangay: filters.barangay?.trim() || undefined,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  };
}

export class ApiFieldValidationRepository implements FieldValidationRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async getMap(filters?: FieldValidationFilters): Promise<FieldValidationMapData> {
    const response = await this.client.get("/api/v1/reports/map", {
      params: toQueryParams(filters),
    });
    return mapFieldValidationMap(mapResponseSchema.parse(response.data));
  }

  async getQueue(filters?: FieldValidationFilters): Promise<FieldValidationQueueData> {
    const response = await this.client.get(
      "/api/v1/reports/field-validation-queue",
      {
        params: {
          ...toQueryParams(filters, false),
          limit: 50,
        },
      },
    );
    return mapFieldValidationQueue(
      fieldValidationQueueResponseSchema.parse(response.data).data,
    );
  }
}
