export const FIELD_SURVEYS_DEFAULT_LIMIT = 100;
export const FIELD_SURVEYS_MAX_LIMIT = 250;

export type FieldSurveyPosition = [longitude: number, latitude: number];
export type FieldSurveyLinearRing = FieldSurveyPosition[];

export interface FieldSurveyPolygon {
  type: "Polygon";
  coordinates: FieldSurveyLinearRing[];
}

export interface FieldSurveyBoundaryFeature {
  type: "Feature";
  id: string;
  geometry: FieldSurveyPolygon;
  properties: {
    id: number;
    capturedAt: string;
    areaSqm: number;
    areaSource: "device_reported";
    inspector: {
      uuid: string;
      name: string;
    };
  };
}

export interface FieldSurveyBoundariesData {
  type: "FeatureCollection";
  features: FieldSurveyBoundaryFeature[];
  metadata: {
    totalCount: number;
    returnedCount: number;
    limit: number;
    truncated: boolean;
  };
}
