import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature } from "../../../domain/fieldSurvey.types";
import type { FieldSurveyBoundariesResponseDto } from "../schemas/fieldSurvey.schema";

export function mapFieldSurveyBoundaries(
  response: FieldSurveyBoundariesResponseDto,
): FieldSurveyBoundariesData {
  const features: FieldSurveyBoundaryFeature[] = response.features.map((feature) => ({
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      id: feature.properties.id,
      capturedAt: feature.properties.captured_at,
      areaSqm: feature.properties.area_sqm,
      areaSource: feature.properties.area_source,
      inspector: feature.properties.inspector,
    },
  }));

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      totalCount: response.metadata.total_count,
      returnedCount: response.metadata.returned_count,
      limit: response.metadata.limit,
      truncated: response.metadata.truncated,
      page: response.metadata.page ?? 1,
      pageCount: response.metadata.page_count
        ?? Math.max(1, Math.ceil(response.metadata.total_count / response.metadata.limit)),
    },
  };
}
