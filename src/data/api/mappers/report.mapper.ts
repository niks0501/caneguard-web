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
    submitterUuid: dto.reporter.uuid,
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
    authorityClassifiedCondition: dto.authority_classified_condition ?? null,
    locationUnavailable: dto.location_unavailable ?? false,
    locationUnavailableReason: dto.location_unavailable_reason ?? null,
    affectedAreaMeasurement: dto.affected_area_measurement,
    affectedPortionMeasurement: dto.affected_portion_measurement,
    followUp: dto.follow_up
      ? { dueOn: dto.follow_up.due_on, overdue: dto.follow_up.overdue }
      : undefined,
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
    submitterUuid: dto.reporter.uuid,
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
    actionTaken: dto.review.action_taken ?? undefined,
    fieldValidationAssignment: dto.field_validation_assignment
      ? {
          uuid: dto.field_validation_assignment.uuid,
          assignee: dto.field_validation_assignment.assignee,
          assignedBy: dto.field_validation_assignment.assigned_by,
          targetVisitDate: dto.field_validation_assignment.target_visit_date ?? undefined,
          activatedAt: dto.field_validation_assignment.activated_at,
          updatedAt: dto.field_validation_assignment.updated_at,
          completion: dto.field_validation_assignment.completion
            ? {
                fieldObservation:
                  dto.field_validation_assignment.completion.field_observation,
                fieldFinding: dto.field_validation_assignment.completion.field_finding,
                actionTaken: dto.field_validation_assignment.completion.action_taken,
              }
            : undefined,
        }
      : dto.field_validation_assignment,
    referral: dto.referral
      ? {
          destination: dto.referral.destination,
          reference: dto.referral.reference,
          referralDate: dto.referral.referral_date,
          note: dto.referral.note,
          responseDate: dto.referral.response_date,
          responseNote: dto.referral.response_note,
          responseFinding: dto.referral.response_finding,
          referredBy: dto.referral.referred_by,
          responseRecordedBy: dto.referral.response_recorded_by,
          responseRecordedAt: dto.referral.response_recorded_at,
          officeContext: {
            caseState: dto.referral.office_context.case_state,
            verificationOutcome: dto.referral.office_context.verification_outcome,
            fieldValidationState: dto.referral.office_context.field_validation_state,
            actionTaken: dto.referral.office_context.action_taken,
            authorityClassifiedCondition:
              dto.referral.office_context.authority_classified_condition,
            notes: dto.referral.office_context.notes,
            reviewer: dto.referral.office_context.reviewer,
            reviewedAt: dto.referral.office_context.reviewed_at,
          },
        }
      : dto.referral,
    metadataCorrectionAudits: dto.audit?.metadata_corrections.map((audit) => ({
      id: audit.id,
      field: audit.field,
      originalValue: audit.original_value,
      correctedValue: audit.corrected_value,
      actorName: audit.actor.name,
      createdAt: audit.created_at,
      reason: audit.reason,
    })),
    canonicalLinkage: dto.duplicate_linkage
      ? {
          isDuplicate: dto.duplicate_linkage.is_duplicate,
          canonicalCase: dto.duplicate_linkage.canonical_case
            ? {
                uuid: dto.duplicate_linkage.canonical_case.uuid,
                referenceCode: dto.duplicate_linkage.canonical_case.reference_code,
                submittedAt: dto.duplicate_linkage.canonical_case.submitted_at,
              }
            : null,
          linkedBy: dto.duplicate_linkage.linked_by,
          linkedAt: dto.duplicate_linkage.linked_at ?? undefined,
          reason: dto.duplicate_linkage.reason ?? undefined,
        }
      : undefined,
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
