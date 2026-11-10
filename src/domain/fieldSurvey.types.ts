export const FIELD_SURVEYS_DEFAULT_LIMIT = 100;
export const FIELD_SURVEYS_MAX_LIMIT = 250;

/** Bounded boundary lookup: never an unbounded archive download. */
export interface FieldSurveysQuery {
  limit?: number;
  page?: number;
  search?: string;
}

export type FieldSurveyPosition = [longitude: number, latitude: number];
export type FieldSurveyLinearRing = FieldSurveyPosition[];

export interface FieldSurveyPolygon {
  type: "Polygon";
  coordinates: FieldSurveyLinearRing[];
}

/** A case that uses a boundary: confirmed by the office, or only attached on the phone. */
export interface FieldSurveyCaseLink {
  uuid: string;
  referenceCode: string;
  link: "confirmed" | "attached";
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
    /** Damage areas the inspector drew inside the plot. */
    affectedAreas: FieldSurveyPolygon[];
    affectedAreaSqm: number | null;
    cases: FieldSurveyCaseLink[];
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
    /** 1-based page of the bounded boundary lookup. */
    page: number;
    pageCount: number;
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

/** The boundary an inspector attached to a case on the phone. */
export interface InspectorBoundaryAttachment {
  clientUuid: string;
  /** The boundary has reached the server. */
  arrived: boolean;
  /** The office already counts it as an affected field. */
  confirmed: boolean;
  boundary: Omit<ReportAffectedField, "lossRatePercent"> | null;
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
