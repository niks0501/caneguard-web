import type { FieldSurveyBoundariesData } from "../../domain/fieldSurvey.types";

export interface FieldSurveysRepository {
  listFieldSurveys(limit?: number): Promise<FieldSurveyBoundariesData>;
}
