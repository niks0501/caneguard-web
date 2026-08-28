import type { DiseaseReport, PaginationMeta } from "../../../domain/report.types";
import type {
  ReportDetailDto,
  ReportListItemDto,
  ReportListResponseDto,
} from "../schemas/report.schema";
import { mapReportLifecycle } from "./lifecycle.mapper";

const humanize = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function mapReportListItem(dto: ReportListItemDto): DiseaseReport {
  return {
    uuid: dto.uuid,
    referenceCode: dto.reference_code,
    barangay: dto.barangay,
    province: dto.province ?? undefined,
    municipality: dto.municipality ?? undefined,
    observedAt: dto.observed_at ?? undefined,
    submittedByName: dto.reporter.name,
    submitterRole: "field_reporter",
    capturedAt: dto.captured_at,
    submittedAt: dto.submitted_at,
    predictedDisease: dto.predicted_label,
    confidence: dto.confidence,
    mismatchReported: dto.mismatch_reported,
    imageUrl: dto.image_url,
    imageStatus: dto.image_url ? "available" : "unavailable",
    symptoms: [],
    reviewStatus: dto.review_status,
    lifecycle: mapReportLifecycle(dto.lifecycle, dto.review_status),
  };
}

export function mapReportDetail(dto: ReportDetailDto): DiseaseReport {
  return {
    uuid: dto.identity.uuid,
    referenceCode: dto.identity.reference_code,
    barangay: dto.barangay,
    farmerOrFarmOwnerName: dto.observations.farmer_or_farm_owner_name ?? undefined,
    province: dto.observations.province ?? undefined,
    municipality: dto.observations.municipality ?? undefined,
    submittedByName: dto.reporter.name,
    submitterRole: "field_reporter",
    capturedAt: dto.timestamps.captured_at,
    observedAt: dto.timestamps.observed_at ?? undefined,
    submittedAt: dto.timestamps.submitted_at,
    finalLatitude: dto.observations.final_latitude ?? undefined,
    finalLongitude: dto.observations.final_longitude ?? undefined,
    locationSource: dto.observations.location_source ?? undefined,
    gpsAccuracy: dto.observations.gps_accuracy ?? undefined,
    scanRecordClientUuid: dto.identity.scan_record_client_uuid ?? undefined,
    predictedDisease: dto.model.predicted_label,
    confidence: dto.model.confidence,
    imageUrl: dto.image.url,
    imageStatus: dto.image.url ? "available" : "unavailable",
    imageMimeType: dto.image.mime_type,
    imageSizeBytes: dto.image.size_bytes,
    imageSourceType: dto.image.source_type,
    sourceWidth: dto.image.source_width ?? undefined,
    sourceHeight: dto.image.source_height ?? undefined,
    symptoms: dto.observations.symptom_keys.map((key) => ({
      id: key,
      label: humanize(key),
      answer: "yes",
    })),
    classScores: dto.model.class_scores,
    modelVersion: dto.model.model_version,
    processingTimingsMs: dto.model.timings_ms,
    checklistConsistency: dto.observations.checklist_consistency,
    reportedSeverity: dto.observations.reported_severity ?? undefined,
    qualityWarnings: dto.observations.quality_warnings,
    sugarcaneVariety: dto.observations.sugarcane_variety ?? undefined,
    cropAge: dto.observations.crop_age ?? undefined,
    caneClass: dto.observations.cane_class ?? undefined,
    affectedAreaHectares: dto.observations.affected_area_hectares ?? undefined,
    affectedPortionPercent: dto.observations.affected_portion_percent ?? undefined,
    fieldNotes: dto.observations.field_notes ?? undefined,
    mismatchReported: dto.reporter_observation.mismatch_reported,
    reporterSuspectedCondition:
      dto.reporter_observation.reporter_suspected_condition,
    reporterObservationText: dto.reporter_observation.reporter_observation_text,
    authorityClassifiedCondition: dto.review.authority_classified_condition,
    reviewStatus: dto.review.status,
    lifecycle: mapReportLifecycle(dto.lifecycle, dto.review.status),
    reviewNotes: dto.review.notes ?? undefined,
    reviewedBy: dto.review.reviewer?.name,
    reviewedAt: dto.review.reviewed_at ?? undefined,
    reviewVersion: dto.version,
    updatedAt: dto.updated_at,
  };
}

export function mapPaginationMeta(
  dto: ReportListResponseDto["meta"],
): PaginationMeta {
  return {
    currentPage: dto.current_page,
    from: dto.from,
    lastPage: dto.last_page,
    perPage: dto.per_page,
    to: dto.to,
    total: dto.total,
  };
}
