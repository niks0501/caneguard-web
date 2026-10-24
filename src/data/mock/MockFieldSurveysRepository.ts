import {
  FIELD_SURVEYS_DEFAULT_LIMIT,
  type FieldSurveyBoundariesData,
  type FieldSurveysQuery,
} from "../../domain/fieldSurvey.types";
import type { FieldSurveysRepository } from "../contracts/FieldSurveysRepository";

/** Mock mode has no captured survey fixtures, so it honestly presents an empty archive. */
export class MockFieldSurveysRepository implements FieldSurveysRepository {
  async listFieldSurveys(
    query: FieldSurveysQuery | number = FIELD_SURVEYS_DEFAULT_LIMIT,
  ): Promise<FieldSurveyBoundariesData> {
    const limit = typeof query === "number" ? query : query.limit ?? FIELD_SURVEYS_DEFAULT_LIMIT;
    return {
      type: "FeatureCollection",
      features: [],
      metadata: {
        totalCount: 0,
        returnedCount: 0,
        limit,
        truncated: false,
        page: 1,
        pageCount: 1,
      },
    };
  }
}
