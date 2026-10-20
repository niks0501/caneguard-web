import type { AxiosInstance } from "axios";
import { axiosClient } from "../../api/axiosClient";
import { FIELD_SURVEYS_DEFAULT_LIMIT, type FieldSurveyBoundariesData } from "../../domain/fieldSurvey.types";
import type { FieldSurveysRepository } from "../contracts/FieldSurveysRepository";
import { mapFieldSurveyBoundaries } from "./mappers/fieldSurvey.mapper";
import { fieldSurveyBoundariesResponseSchema } from "./schemas/fieldSurvey.schema";

export class ApiFieldSurveysRepository implements FieldSurveysRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async listFieldSurveys(limit = FIELD_SURVEYS_DEFAULT_LIMIT): Promise<FieldSurveyBoundariesData> {
    const response = await this.client.get("/api/v1/field-surveys", { params: { limit } });
    return mapFieldSurveyBoundaries(fieldSurveyBoundariesResponseSchema.parse(response.data));
  }
}
