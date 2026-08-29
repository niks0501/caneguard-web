import type {
  DiseaseKey,
  LocationSource,
  ReportLifecycle,
  ReviewStatus,
} from "./report.types";
import type { FieldValidationQueue } from "./operationalQueue";

export interface FieldReporter {
  uuid: string;
  name: string;
}

export interface FieldValidationFilters {
  queue?: FieldValidationQueue;
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
  lifecycle?: ReportLifecycle;
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
  lifecycle?: ReportLifecycle;
  targetVisitDate?: string | null;
  finalLatitude: number | null;
  finalLongitude: number | null;
  locationSource: LocationSource | null;
  gpsAccuracy: number | null;
  affectedAreaHectares: number | null;
  affectedPortionPercent: number | null;
}

export interface FieldValidationQueueData {
  queue?: FieldValidationQueue;
  count: number;
  oldest: FieldValidationQueueItem | null;
  items: FieldValidationQueueItem[];
}
