import type {
  FieldValidationMapData,
  FieldValidationMapFeature,
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../../domain/fieldValidation.types";
import type {
  FieldValidationQueueItemDto,
  MapResponseDto,
} from "../schemas/fieldValidation.schema";
import { mapReportLifecycle } from "./lifecycle.mapper";

function mapQueueItem(dto: FieldValidationQueueItemDto): FieldValidationQueueItem {
  return {
    uuid: dto.uuid,
    referenceCode: dto.reference_code,
    barangay: dto.barangay,
    province: dto.province,
    municipality: dto.municipality,
    observedAt: dto.observed_at,
    submittedAt: dto.submitted_at,
    predictedDisease: dto.predicted_label,
    confidence: dto.confidence,
    reviewStatus: dto.review_status,
    lifecycle: mapReportLifecycle(dto.lifecycle, dto.review_status),
    targetVisitDate: dto.target_visit_date ?? null,
    assignee: dto.assignee
      ? { uuid: dto.assignee.uuid, name: dto.assignee.name }
      : null,
    finalLatitude: dto.final_latitude,
    finalLongitude: dto.final_longitude,
    locationSource: dto.location_source,
    locationUnavailable: dto.location_unavailable,
    locationUnavailableReason: dto.location_unavailable_reason ?? null,
    gpsAccuracy: dto.gps_accuracy,
    affectedAreaHectares: dto.affected_area_hectares,
    affectedPortionPercent: dto.affected_portion_percent,
  };
}

export function mapFieldValidationMap(dto: MapResponseDto): FieldValidationMapData {
  const features: FieldValidationMapFeature[] = dto.features.map((feature) => ({
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      uuid: feature.properties.uuid,
      referenceCode: feature.properties.reference_code,
      barangay: feature.properties.barangay,
      province: feature.properties.province,
      municipality: feature.properties.municipality,
      observedAt: feature.properties.observed_at,
      submittedAt: feature.properties.submitted_at,
      predictedDisease: feature.properties.predicted_label,
      confidence: feature.properties.confidence,
      reviewStatus: feature.properties.review_status,
      lifecycle: mapReportLifecycle(
        feature.properties.lifecycle,
        feature.properties.review_status,
      ),
      locationSource: feature.properties.location_source,
      gpsAccuracy: feature.properties.gps_accuracy,
      affectedAreaHectares: feature.properties.affected_area_hectares,
      affectedPortionPercent: feature.properties.affected_portion_percent,
    },
  }));

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      totalCount: dto.metadata.total_count,
      locatedCount: dto.metadata.located_count,
      unlocatedCount: dto.metadata.unlocated_count,
      limit: dto.metadata.limit,
      returnedCount: dto.metadata.returned_count,
      truncated: dto.metadata.truncated,
    },
  };
}

export function mapFieldValidationQueue(
  data: {
    queue?: "needs_visit" | "follow_up_due" | "upcoming";
    count: number;
    total?: number;
    page?: number;
    per_page?: number;
    oldest: FieldValidationQueueItemDto | null;
    items: FieldValidationQueueItemDto[];
  },
): FieldValidationQueueData {
  const items = data.items.map(mapQueueItem);
  return {
    queue: data.queue,
    count: data.count,
    total: data.total ?? data.count,
    page: data.page,
    perPage: data.per_page,
    oldest: data.oldest ? mapQueueItem(data.oldest) : null,
    items,
  };
}
