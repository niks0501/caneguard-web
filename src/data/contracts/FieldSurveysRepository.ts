import type { FieldSurveyBoundariesData, FieldSurveysQuery } from "../../domain/fieldSurvey.types";

export interface FieldSurveysRepository {
  listFieldSurveys(query?: FieldSurveysQuery | number): Promise<FieldSurveyBoundariesData>;
}
