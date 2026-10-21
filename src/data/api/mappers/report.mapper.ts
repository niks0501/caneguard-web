import type {
  DiseaseReport,
  IdentificationGap,
  PaginationMeta,
  ReportCaseHistory,
} from "../../../domain/report.types";
import type { ReportAffectedField } from "../../../domain/fieldSurvey.types";
import type {
  ReportDetailDto,
  ReportListItemDto,
  ReportListResponseDto,
} from "../schemas/report.schema";
import { env } from "../../../config/env";
import { mapReportLifecycle } from "./lifecycle.mapper";

const humanize = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/** Resolve app-relative API links and rebase legacy host-local URLs onto the API host. */
export function resolveApiUrl(
  apiUrl: string | null | undefined,
  apiBaseUrl: string,
): string | undefined {
  if (!apiUrl) return undefined;

  try {
    const url = new URL(apiUrl, apiBaseUrl);
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      const apiOrigin = new URL(apiBaseUrl);
      url.protocol = apiOrigin.protocol;
      url.hostname = apiOrigin.hostname;
      url.port = apiOrigin.port;
    }
    return url.href;
  } catch {
    return apiUrl;
  }
}

export function resolveReportImageUrl(
  imageUrl: string | null | undefined,
  apiBaseUrl: string,
): string | undefined {
  return resolveApiUrl(imageUrl, apiBaseUrl);
}

function mapCaseHistory(dto: ReportDetailDto["case_history"]): ReportCaseHistory | undefined {
  if (!dto) return undefined;

  return {
    entries: dto.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      typeLabel: entry.type_label,
      timestamp: entry.timestamp,
      actor: entry.actor,
      fields: entry.fields,
      notes: entry.notes ?? null,
    })),
    available: dto.available,
    sources: {
      reviewEvents: dto.sources.review_events,
      corrections: dto.sources.corrections,
      assignments: dto.sources.assignments,
      consults: dto.sources.consults,
    },
  };
}

function mapIdentificationGap(dto: {
  state: "identified" | "provisional" | "unidentified";
  reasons: string[];
} | undefined): IdentificationGap {
  return dto ?? { state: "identified", reasons: [] };
}

function mapMachineFacts(dto: {
  confidence?: number | null;
  checklist_consistency?: string | null;
  quality_warnings: string[];
  gps_accuracy?: number | null;
  location_source?: "gps" | "manual_map" | "unavailable" | null;
  reporter_concern?: string | null;
  reporter_mismatch?: boolean | null;
} | undefined) {
  if (!dto) return undefined;

  return {
    confidence: dto.confidence ?? null,
    checklistConsistency: dto.checklist_consistency ?? null,
    qualityWarnings: dto.quality_warnings,
    gpsAccuracy: dto.gps_accuracy ?? null,
    locationSource: dto.location_source ?? null,
    reporterConcern: dto.reporter_concern ?? null,
    reporterMismatch: dto.reporter_mismatch ?? null,
  };
}

export function mapReportListItem(dto: ReportListItemDto): DiseaseReport {
  return {
    uuid: dto.uuid,
    referenceCode: dto.reference_code,
    barangay: dto.barangay,
    farmerOrFarmOwnerName: dto.farmer_or_farm_owner_name ?? undefined,
    farmReference: dto.farm_reference ?? undefined,
    province: dto.province ?? undefined,
    municipality: dto.municipality ?? undefined,
    observedAt: dto.observed_at ?? undefined,
    submittedByName: dto.reporter.name,
    submitterUuid: dto.reporter.uuid,
    submitterRole: "field_reporter",
    capturedAt: dto.captured_at,
    submittedAt: dto.submitted_at,
    firstReviewedAt: dto.first_reviewed_at ?? undefined,
    scheduledRevisit: dto.scheduled_revisit ?? false,
    predictedDisease: dto.predicted_label,
    mismatchReported: dto.mismatch_reported,
    imageUrl: resolveReportImageUrl(dto.image_url, env.apiBaseUrl),
    imageStatus: dto.image_url ? "available" : "unavailable",
    symptoms: [],
    reviewStatus: dto.review_status,
    lifecycle: mapReportLifecycle(dto.lifecycle, dto.review_status),
    authorityClassifiedCondition: dto.authority_classified_condition ?? null,
    reporterSuspectedCondition: dto.reporter_suspected_condition ?? null,
    reporterObservationText: dto.reporter_observation_text ?? null,
    actionTaken: dto.action_taken ?? null,
    machineFacts: mapMachineFacts(dto.machine_facts),
    attentionBand: dto.attention_band ?? null,
    attentionBandReasons: dto.attention_band_reasons ?? [],
    identificationGap: mapIdentificationGap(dto.identification_gap),
    reviewVersion: dto.version ?? 0,
    fieldValidationAssignment: dto.field_validation?.assignee && dto.field_validation.assignment_uuid
      ? {
          uuid: dto.field_validation.assignment_uuid,
          assignee: dto.field_validation.assignee,
          assignedBy: dto.field_validation.assigned_by ?? dto.field_validation.assignee,
          targetVisitDate: dto.field_validation.target_visit_date ?? undefined,
          activatedAt: dto.field_validation.activated_at ?? dto.submitted_at,
          updatedAt: dto.field_validation.updated_at ?? dto.submitted_at,
        }
      : null,
    latestValidation: dto.latest_validation
      ? {
          visitedAt: dto.latest_validation.visited_at,
          fieldObservation: dto.latest_validation.field_observation,
          finding: dto.latest_validation.finding,
          actionTaken: dto.latest_validation.action_taken,
          followUpOutcome: dto.latest_validation.follow_up_outcome,
          assignee: dto.latest_validation.assignee,
          freshPhoto: {
            ...dto.latest_validation.fresh_photo,
            url:
              resolveApiUrl(dto.latest_validation.fresh_photo.url, env.apiBaseUrl) ??
              dto.latest_validation.fresh_photo.url,
          },
        }
      : null,
    locationUnavailable: dto.location_unavailable ?? false,
    locationUnavailableReason: dto.location_unavailable_reason ?? null,
    affectedAreaHectares: dto.affected_area_hectares ?? undefined,
    affectedAreaMeasurement: dto.affected_area_measurement,
    affectedPortionMeasurement: dto.affected_portion_measurement,
    followUp: dto.follow_up
      ? { dueOn: dto.follow_up.due_on, overdue: dto.follow_up.overdue }
      : undefined,
  };
}

export function mapReportAffectedField(
  dto: NonNullable<ReportDetailDto["affected_fields"]>[number],
): ReportAffectedField {
  return {
    fieldSurveyId: dto.field_survey_id,
    geometry: dto.geometry,
    capturedAt: dto.captured_at,
    areaSqm: dto.area_sqm,
    areaSource: dto.area_source,
    inspector: dto.inspector,
    lossRatePercent: dto.loss_rate_percent,
  };
}

export function mapReportDetail(
  dto: ReportDetailDto,
  apiBaseUrl = env.apiBaseUrl,
): DiseaseReport {
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
    firstReviewedAt: dto.first_reviewed_at ?? undefined,
    scheduledRevisit: dto.scheduled_revisit ?? false,
    finalLatitude: dto.observations.final_latitude ?? undefined,
    finalLongitude: dto.observations.final_longitude ?? undefined,
    locationSource: dto.observations.location_source ?? undefined,
    locationUnavailable: dto.observations.location_source === "unavailable",
    locationUnavailableReason: dto.observations.location_unavailable_reason ?? null,
    gpsAccuracy: dto.observations.gps_accuracy ?? undefined,
    scanRecordClientUuid: dto.identity.scan_record_client_uuid ?? undefined,
    predictedDisease: dto.model.predicted_label,
    confidence: dto.model.confidence,
    imageUrl: resolveReportImageUrl(dto.image.url, apiBaseUrl),
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
    modelVersionRecognised: dto.model.model_version_recognised,
    processingTimingsMs: dto.model.timings_ms,
    checklistConsistency: dto.observations.checklist_consistency,
    reportedSeverity: dto.observations.reported_severity ?? undefined,
    qualityWarnings: dto.observations.quality_warnings,
    sugarcaneVariety: dto.observations.sugarcane_variety ?? undefined,
    cropAge: dto.observations.crop_age ?? undefined,
    caneClass: dto.observations.cane_class ?? undefined,
    affectedAreaHectares: dto.observations.affected_area_hectares ?? undefined,
    affectedAreaMeasurement: dto.observations.affected_area_measurement,
    affectedPortionPercent: dto.observations.affected_portion_percent ?? undefined,
    affectedPortionMeasurement: dto.observations.affected_portion_measurement,
    fieldNotes: dto.observations.field_notes ?? undefined,
    mismatchReported: dto.reporter_observation.mismatch_reported,
    reporterSuspectedCondition:
      dto.reporter_observation.reporter_suspected_condition,
    reporterObservationText: dto.reporter_observation.reporter_observation_text,
    authorityClassifiedCondition: dto.review.authority_classified_condition,
    machineFacts: mapMachineFacts(dto.machine_facts),
    caseHistory: mapCaseHistory(dto.case_history),
    attentionBand: dto.attention_band ?? null,
    attentionBandReasons: dto.attention_band_reasons ?? [],
    identificationGap: mapIdentificationGap(dto.identification_gap),
    actionTaken: dto.review.action_taken ?? undefined,
    advisory: dto.advisory
      ? {
          uuid: dto.advisory.uuid,
          code: dto.advisory.code,
          title: dto.advisory.title,
          content: dto.advisory.content,
          status: dto.advisory.status,
          validationProvenance: dto.advisory.validation_provenance,
          validatedAt: dto.advisory.validated_at,
          selectedAt: dto.advisory.selected_at,
          deliveryState: dto.advisory.delivery_state,
          deliveredAt: dto.advisory.delivered_at,
          acknowledgedAt: dto.advisory.acknowledged_at,
        }
      : dto.advisory,
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
                followUpOutcome: dto.field_validation_assignment.completion.follow_up_outcome,
                visitedAt: dto.field_validation_assignment.completion.visited_at,
                freshPhoto: {
                  available: dto.field_validation_assignment.completion.fresh_photo.available,
                  url:
                    resolveApiUrl(
                      dto.field_validation_assignment.completion.fresh_photo.url,
                      apiBaseUrl,
                    ) ?? dto.field_validation_assignment.completion.fresh_photo.url,
                },
              }
            : undefined,
        }
      : dto.field_validation_assignment,
    handoffNotes: dto.handoff_notes ?? [],
    referral: dto.referral
      ? {
          id: dto.referral.id,
          status: dto.referral.status,
          destination: dto.referral.destination,
          reference: dto.referral.reference,
          trackingCode: dto.referral.tracking_code ?? null,
          referralDate: dto.referral.referral_date,
          dueDate: dto.referral.due_date,
          expertName: dto.referral.expert_name,
          expertContact: dto.referral.expert_contact,
          shareFullContext: dto.referral.share_full_context ?? false,
          inviteIssuedAt: dto.referral.invite_issued_at ?? null,
          inviteExpiresAt: dto.referral.invite_expires_at ?? null,
          inviteRevokedAt: dto.referral.invite_revoked_at ?? null,
          inviteAccessCount: dto.referral.invite_access_count ?? 0,
          inviteFirstAccessedAt: dto.referral.invite_first_accessed_at ?? null,
          inviteLastAccessedAt: dto.referral.invite_last_accessed_at ?? null,
          note: dto.referral.note,
          responseDate: dto.referral.response_date,
          responseNote: dto.referral.response_note,
          responseFinding: dto.referral.response_finding,
          findingSummary: dto.referral.finding_summary ?? dto.referral.response_note,
          conditionOpinion: dto.referral.condition_opinion ?? null,
          symptomVerdicts: dto.referral.symptom_verdicts ?? null,
          findingDetails: dto.referral.finding_details ?? dto.referral.finding ?? dto.referral.response_finding,
          findingConfidence: dto.referral.finding_confidence ?? null,
          findingRecommendation: dto.referral.finding_recommendation ?? dto.referral.recommendation,
          findingSource: dto.referral.finding_source ?? dto.referral.source,
          findingRecordedBy: dto.referral.finding_recorded_by,
          findingRecordedAt: dto.referral.finding_recorded_at,
          referredBy: dto.referral.referred_by,
          responseRecordedBy: dto.referral.response_recorded_by,
          responseRecordedAt: dto.referral.response_recorded_at,
          consultReviewOutcome: dto.referral.consult_review_outcome ?? null,
          consultReviewNote: dto.referral.consult_review_note ?? null,
          consultReviewedBy: dto.referral.consult_reviewed_by ?? null,
          consultReviewedAt: dto.referral.consult_reviewed_at ?? null,
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
    consults: dto.consults?.map((consult) => ({
      id: consult.id,
      status: consult.status,
      destination: consult.destination,
      reference: consult.reference,
      trackingCode: consult.tracking_code ?? null,
      referralDate: consult.referral_date,
      note: consult.note,
      dueDate: consult.due_date,
      expertName: consult.expert_name,
      expertContact: consult.expert_contact,
      shareFullContext: consult.share_full_context ?? false,
      inviteIssuedAt: consult.invite_issued_at ?? null,
      inviteExpiresAt: consult.invite_expires_at ?? null,
      inviteRevokedAt: consult.invite_revoked_at ?? null,
      inviteAccessCount: consult.invite_access_count ?? 0,
      inviteFirstAccessedAt: consult.invite_first_accessed_at ?? null,
      inviteLastAccessedAt: consult.invite_last_accessed_at ?? null,
      findingSummary: consult.finding_summary,
      conditionOpinion: consult.condition_opinion ?? null,
      symptomVerdicts: consult.symptom_verdicts ?? null,
      findingDetails: consult.finding_details ?? consult.finding,
      findingConfidence: consult.finding_confidence ?? null,
      findingRecommendation: consult.finding_recommendation ?? consult.recommendation,
      findingSource: consult.finding_source ?? consult.source,
      responseDate: consult.response_date,
      consultReviewOutcome: consult.consult_review_outcome ?? null,
      consultReviewNote: consult.consult_review_note ?? null,
      consultReviewedBy: consult.consult_reviewed_by ?? null,
      consultReviewedAt: consult.consult_reviewed_at ?? null,
    })),
    metadataCorrectionAudits: dto.audit?.metadata_corrections.map((audit) => ({
      id: audit.id,
      field: audit.field,
      originalValue: audit.original_value,
      correctedValue: audit.corrected_value,
      actorName: audit.actor.name,
      createdAt: audit.created_at,
      reason: audit.reason,
    })),
    affectedFields: dto.affected_fields?.map(mapReportAffectedField) ?? [],
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
    reviewEvents: dto.review_events?.map((event) => ({
      id: event.id,
      actor: event.actor ? { uuid: event.actor.uuid, name: event.actor.name } : null,
      actionTaken: event.action_taken ?? null,
      authorityClassifiedCondition: event.authority_classified_condition ?? null,
      verificationOutcome: event.verification_outcome ?? null,
      notes: event.notes ?? null,
      caseState: event.case_state ?? null,
      createdAt: event.created_at,
    })),
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
