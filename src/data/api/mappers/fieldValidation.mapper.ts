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
    finalLatitude: dto.final_latitude,
    finalLongitude: dto.final_longitude,
    locationSource: dto.location_source,
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
    },
  };
}

export function mapFieldValidationQueue(
  data: {
    count: number;
    oldest: FieldValidationQueueItemDto | null;
    items: FieldValidationQueueItemDto[];
  },
): FieldValidationQueueData {
  const items = data.items.map(mapQueueItem);
  return {
    count: data.count,
    oldest: data.oldest ? mapQueueItem(data.oldest) : null,
    items,
  };
}
