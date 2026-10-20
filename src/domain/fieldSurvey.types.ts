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

export interface ReportAffectedField {
  fieldSurveyId: number;
  geometry: FieldSurveyPolygon;
  capturedAt: string;
  areaSqm: number;
  areaSource: "device_reported";
  inspector: {
    uuid: string;
    name: string;
  };
  lossRatePercent: number;
}

export interface AffectedFieldLinkInput {
  fieldSurveyId: number;
  lossRatePercent: number;
}

export interface UpdateAffectedFieldsInput {
  expectedVersion: number;
  affectedFields: AffectedFieldLinkInput[];
}

export interface UpdateAffectedFieldsResult {
  affectedFields: ReportAffectedField[];
  version: number;
  updatedAt: string;
}
