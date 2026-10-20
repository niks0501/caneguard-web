import {
  FIELD_SURVEYS_DEFAULT_LIMIT,
  type FieldSurveyBoundariesData,
} from "../../domain/fieldSurvey.types";
import type { FieldSurveysRepository } from "../contracts/FieldSurveysRepository";

/** Mock mode has no captured survey fixtures, so it honestly presents an empty archive. */
export class MockFieldSurveysRepository implements FieldSurveysRepository {
  async listFieldSurveys(limit = FIELD_SURVEYS_DEFAULT_LIMIT): Promise<FieldSurveyBoundariesData> {
    return {
      type: "FeatureCollection",
      features: [],
      metadata: {
        totalCount: 0,
        returnedCount: 0,
        limit,
        truncated: false,
      },
    };
  }
}
