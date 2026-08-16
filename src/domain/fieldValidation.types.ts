import type { DiseaseKey, LocationSource, ReviewStatus } from "./report.types";

export interface FieldValidationFilters {
  status?: ReviewStatus;
  disease?: DiseaseKey;
  barangay?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FieldValidationMapProperties {
  uuid: string;
  referenceCode: string;
  barangay: string;
  province: string | null;
  municipality: string | null;
  observedAt: string | null;
  submittedAt: string;
  predictedDisease: DiseaseKey;
  confidence: number;
  reviewStatus: ReviewStatus;
  locationSource: LocationSource | null;
  gpsAccuracy: number | null;
  affectedAreaHectares: number | null;
  affectedPortionPercent: number | null;
}

export interface FieldValidationMapFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: FieldValidationMapProperties;
}

export interface FieldValidationMapData {
  type: "FeatureCollection";
  features: FieldValidationMapFeature[];
  metadata: {
    totalCount: number;
    locatedCount: number;
    unlocatedCount: number;
  };
}

export interface FieldValidationQueueItem {
  uuid: string;
  referenceCode: string;
  barangay: string;
  province: string | null;
  municipality: string | null;
  observedAt: string | null;
  submittedAt: string;
  predictedDisease: DiseaseKey;
  confidence: number;
  reviewStatus: ReviewStatus;
  finalLatitude: number | null;
  finalLongitude: number | null;
  locationSource: LocationSource | null;
  gpsAccuracy: number | null;
  affectedAreaHectares: number | null;
  affectedPortionPercent: number | null;
}

export interface FieldValidationQueueData {
  count: number;
  oldest: FieldValidationQueueItem | null;
  items: FieldValidationQueueItem[];
}
