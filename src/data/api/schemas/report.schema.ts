import { z } from "zod";
import {
  paginationLinksSchema,
  paginationMetaSchema,
  userSchema,
} from "./common.schema";

export const diseaseKeySchema = z.enum(["healthy", "mosaic", "rust", "smut"]);
export const authorityClassifiedConditionSchema = z.enum([
  "healthy",
  "smut",
  "mosaic",
  "rust",
  "rssi",
  "mixed_or_multiple",
  "unable_to_classify",
  "downy_mildew",
]);
export const reviewStatusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
]);
export const measurementProvenanceSchema = z.enum(["measured", "not_measured"]);
export const locationUnavailableReasonSchema = z.enum([
  "permission_denied",
  "services_unavailable",
  "low_accuracy",
  "offline_no_map",
  "other",
]);
export const caseStateSchema = z.enum(["open", "closed"]);
export const verificationOutcomeSchema = z.enum([
  "not_determined",
  "verified",
  "unable_to_verify",
]);
export const fieldValidationStateSchema = z.enum([
  "unassigned",
  "assigned",
  "in_progress",
  "completed",
]);
export const referralStateSchema = z.enum([
  "not_referred",
  "referred",
  "expert_response_received",
]);
export const consultStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export const findingSourceSchema = z.enum(["in_system", "transcribed"]);
export const consultReviewOutcomeSchema = z.enum(["accepted", "overridden"]);
export const symptomVerdictsSchema = z.record(
  z.string(),
  z.object({
    verdict: z.enum(["present", "absent", "unsure"]),
    note: z.string().nullable().optional(),
  }),
);
export const canonicalCaseSchema = z.object({
  uuid: z.string(),
  reference_code: z.string(),
  submitted_at: z.iso.datetime({ offset: true }),
});
export const duplicateLinkageSchema = z.object({
  is_duplicate: z.boolean(),
  canonical_case: canonicalCaseSchema.nullable(),
  linked_by: userSchema.pick({ uuid: true, name: true }).nullable(),
  linked_at: z.iso.datetime({ offset: true }).nullable(),
  reason: z.string().nullable(),
});
export const possibleMatchBasisSchema = z.enum([
  "same_condition",
  "nearby_location",
  "recent_submission",
]);
export const possibleRecentMatchSchema = z.object({
  case: z.object({
    uuid: z.string(),
    reference_code: z.string(),
    submitted_at: z.iso.datetime({ offset: true }),
  }),
  match: z.object({
    condition: diseaseKeySchema,
    distance_meters: z.number().nonnegative(),
    basis: z.array(possibleMatchBasisSchema),
  }),
  message: z.string(),
});
export const possibleRecentMatchesResponseSchema = z.object({
  data: z.array(possibleRecentMatchSchema),
  message: z.string(),
  meta: z.object({
    possible_match: z.boolean(),
    can_submit: z.boolean(),
    assessment: z.enum(["condition_and_location", "location_unavailable"]),
    recent_window_hours: z.number().int().positive(),
    location_radius_meters: z.number().positive(),
  }),
});
export const actionTakenSchema = z.enum([
  "advisory_provided",
  "technical_assistance_provided",
  "referred_for_expert_validation",
  "no_further_action_required",
]);
export const reportLifecycleSchema = z.object({
  case_state: caseStateSchema,
  verification_outcome: verificationOutcomeSchema,
  field_validation_state: fieldValidationStateSchema,
  referral_state: referralStateSchema,
});
export const advisoryStatusSchema = z.enum(["draft", "validated", "retired"]);
export const advisoryDeliveryStateSchema = z.enum([
  "not_selected",
  "pending",
  "delivered",
  "acknowledged",
]);
export const advisorySchema = z.object({
  uuid: z.string(),
  code: z.string(),
  title: z.string(),
  content: z.string(),
  status: advisoryStatusSchema,
  validation_provenance: z.string().nullable().optional(),
  validated_at: z.iso.datetime({ offset: true }).nullable().optional(),
  selected_at: z.iso.datetime({ offset: true }).nullable().optional(),
  delivery_state: advisoryDeliveryStateSchema.optional(),
  delivered_at: z.iso.datetime({ offset: true }).nullable().optional(),
  acknowledged_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
export const followUpOutcomeSchema = z.enum([
  "improved",
  "unchanged",
  "worsened",
  "unable_to_determine",
]);

export const fieldValidationCompletionSchema = z.object({
  uuid: z.string(),
  client_uuid: z.string(),
  assignment_uuid: z.string(),
  field_observation: z.string(),
  field_finding: z.string(),
  action_taken: z.string(),
  follow_up_outcome: followUpOutcomeSchema.nullable().optional(),
  visited_at: z.iso.datetime({ offset: true }),
  gps: z.object({
    outcome: z.enum([
      "resolved",
      "low_accuracy",
      "permission_denied",
      "unavailable",
      "error",
    ]),
    attempted_at: z.iso.datetime({ offset: true }),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    accuracy: z.number().nonnegative().nullable(),
  }),
  fresh_photo: z.object({
    available: z.boolean(),
    url: z.string().nullable().optional(),
    mime_type: z.string().nullable(),
    size_bytes: z.number().int().nonnegative().nullable(),
  }),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const fieldValidationAssignmentSchema = z.object({
  uuid: z.string(),
  assignee: userSchema.pick({ uuid: true, name: true }),
  assigned_by: userSchema.pick({ uuid: true, name: true }),
  target_visit_date: z.string().nullable(),
  activated_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  completion: fieldValidationCompletionSchema.optional(),
});

const referralPersonSchema = userSchema.pick({ uuid: true, name: true });
export const referralOfficeContextSchema = z.object({
  case_state: caseStateSchema,
  verification_outcome: verificationOutcomeSchema,
  field_validation_state: fieldValidationStateSchema,
  action_taken: actionTakenSchema.nullable(),
  authority_classified_condition: authorityClassifiedConditionSchema.nullable(),
  notes: z.string().nullable(),
  reviewer: referralPersonSchema.nullable(),
  reviewed_at: z.iso.datetime({ offset: true }).nullable(),
});
export const expertDirectoryResponseSchema = z.object({
  data: z.array(z.object({
    uuid: z.string(),
    name: z.string(),
    email: z.email(),
  })),
});

export const reportReferralSchema = z.object({
  id: z.number().int().positive().optional(),
  status: consultStatusSchema.optional(),
  destination: z.string(),
  reference: z.string(),
  referral_date: z.string(),
  due_date: z.string().nullable().optional(),
  expert: referralPersonSchema.nullable().optional(),
  expert_name: z.string().nullable().optional(),
  expert_contact: z.string().nullable().optional(),
  share_full_context: z.boolean().optional(),
  invite_issued_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_revoked_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_access_count: z.number().int().nonnegative().optional(),
  invite_first_accessed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_last_accessed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  note: z.string().nullable(),
  response_date: z.string().nullable(),
  response_note: z.string().nullable(),
  response_finding: z.string().nullable(),
  finding_summary: z.string().nullable().optional(),
  condition_opinion: authorityClassifiedConditionSchema.nullable().optional(),
  symptom_verdicts: symptomVerdictsSchema.nullable().optional(),
  finding_details: z.string().nullable().optional(),
  finding_confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  finding_recommendation: z.string().nullable().optional(),
  finding: z.string().nullable().optional(),
  recommendation: z.string().nullable().optional(),
  finding_source: findingSourceSchema.nullable().optional(),
  source: findingSourceSchema.nullable().optional(),
  finding_recorded_by: referralPersonSchema.nullable().optional(),
  finding_recorded_at: z.iso.datetime({ offset: true }).nullable().optional(),
  referred_by: referralPersonSchema.nullable(),
  response_recorded_by: referralPersonSchema.nullable(),
  response_recorded_at: z.iso.datetime({ offset: true }).nullable(),
  consult_review_outcome: consultReviewOutcomeSchema.nullable().optional(),
  consult_review_note: z.string().nullable().optional(),
  consult_reviewed_by: referralPersonSchema.nullable().optional(),
  consult_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  office_context: referralOfficeContextSchema,
});
export const reportConsultSchema = z.object({
  id: z.number().int().positive(),
  status: consultStatusSchema.optional(),
  destination: z.string(),
  reference: z.string(),
  referral_date: z.string(),
  due_date: z.string().nullable().optional(),
  expert: referralPersonSchema.nullable().optional(),
  expert_name: z.string().nullable().optional(),
  expert_contact: z.string().nullable().optional(),
  share_full_context: z.boolean().optional(),
  invite_issued_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_revoked_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_access_count: z.number().int().nonnegative().optional(),
  invite_first_accessed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  invite_last_accessed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  finding_summary: z.string().nullable().optional(),
  condition_opinion: authorityClassifiedConditionSchema.nullable().optional(),
  symptom_verdicts: symptomVerdictsSchema.nullable().optional(),
  finding_details: z.string().nullable().optional(),
  finding_confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  finding_recommendation: z.string().nullable().optional(),
  finding: z.string().nullable().optional(),
  recommendation: z.string().nullable().optional(),
  finding_source: findingSourceSchema.nullable().optional(),
  source: findingSourceSchema.nullable().optional(),
  finding_recorded_at: z.iso.datetime({ offset: true }).nullable().optional(),
  response_date: z.string().nullable(),
  consult_review_outcome: consultReviewOutcomeSchema.nullable().optional(),
  consult_review_note: z.string().nullable().optional(),
  consult_reviewed_by: referralPersonSchema.nullable().optional(),
  consult_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const attentionBandSchema = z.enum(["green", "amber", "red"]);
export const identificationGapSchema = z.object({
  state: z.enum(["identified", "provisional", "unidentified"]),
  reasons: z.array(z.string()),
});
export const expertConsultSummarySchema = z.object({
  id: z.number().int().positive(),
  status: consultStatusSchema,
  referral_date: z.string().nullable(),
  due_date: z.string().nullable(),
  expert: referralPersonSchema.nullable(),
  expert_name: z.string().nullable().optional(),
  days_until_due: z.number().int().nullable(),
  days_out: z.number().int().nullable(),
  overdue: z.boolean(),
  age_label: z.string(),
});

const expertConsultFindingSchema = z.object({
  id: z.number().int().positive(),
  status: consultStatusSchema,
  reference: z.string(),
  referral_date: z.string().nullable(),
  due_date: z.string().nullable(),
  question: z.string().nullable().optional(),
  expert: referralPersonSchema.nullable().optional(),
  share_full_context: z.boolean().optional(),
  condition_opinion: authorityClassifiedConditionSchema.nullable().optional(),
  basis: z.string().nullable().optional(),
  finding_details: z.string().nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  recommendation: z.string().nullable().optional(),
  symptom_verdicts: symptomVerdictsSchema,
  response_date: z.string().nullable().optional(),
  finding_source: findingSourceSchema.nullable().optional(),
  finding_recorded_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
export const expertConsultResponseSchema = z.object({
  data: z.object({
    case: z.object({
      uuid: z.string(),
      reference_code: z.string(),
      submitted_at: z.iso.datetime({ offset: true }),
      photo_url: z.string(),
      reporter_observations: z.object({
        symptom_keys: z.array(z.string()),
        reporter_observation_text: z.string().nullable().optional(),
        field_notes: z.string().nullable().optional(),
        reporter_suspected_condition: z.string().nullable().optional(),
        checklist_consistency: z.string().nullable().optional(),
        reported_severity: z.string().nullable().optional(),
        quality_warnings: z.array(z.string()),
      }),
      reporter_suspected_condition: z.string().nullable().optional(),
      ai_possible_condition: z.object({
        label: z.string(),
        predicted_label: z.string(),
        decision_support_label: z.string(),
      }),
      location: z.object({
        barangay: z.string(),
        municipality: z.string().nullable().optional(),
        province: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
      }),
      measurements: z.object({
        affected_area_hectares: z.number().nullable(),
        affected_area_measurement: z.string(),
        affected_portion_percent: z.number().nullable(),
        affected_portion_measurement: z.string(),
      }),
    }),
    reference_code: z.string(),
    submitted_at: z.iso.datetime({ offset: true }),
    photo_url: z.string(),
    reporter_observations: z.object({
      symptom_keys: z.array(z.string()),
      reporter_observation_text: z.string().nullable().optional(),
      field_notes: z.string().nullable().optional(),
      reporter_suspected_condition: z.string().nullable().optional(),
      checklist_consistency: z.string().nullable().optional(),
      reported_severity: z.string().nullable().optional(),
      quality_warnings: z.array(z.string()),
    }),
    reporter_suspected_condition: z.string().nullable().optional(),
    symptom_keys: z.array(z.string()),
    ai_possible_condition: z.object({
      label: z.string(),
      predicted_label: z.string(),
      decision_support_label: z.string(),
    }),
    location: z.object({
      barangay: z.string(),
      municipality: z.string().nullable().optional(),
      province: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    }),
    affected_area: z.object({ value: z.number().nullable(), unit: z.string(), measurement: z.string() }),
    affected_portion: z.object({ value: z.number().nullable(), unit: z.string(), measurement: z.string() }),
    office_context: referralOfficeContextSchema,
    consult: expertConsultFindingSchema,
    due_date: z.string().nullable(),
    question: z.string().nullable(),
    prior_consults: z.array(expertConsultFindingSchema),
    version: z.number().int().nonnegative(),
    share_full_context: z.boolean().optional(),
    farmer_or_farm_owner_name: z.string().nullable().optional(),
  }),
});

export const reportMachineFactsSchema = z.object({
  confidence: z.number().min(0).max(1).nullable().optional(),
  checklist_consistency: z.string().nullable().optional(),
  quality_warnings: z.array(z.string()),
  gps_accuracy: z.number().nonnegative().nullable().optional(),
  location_source: z.enum(["gps", "manual_map", "unavailable"]).nullable().optional(),
  reporter_concern: z.string().nullable().optional(),
  reporter_mismatch: z.boolean().nullable().optional(),
});

export const reportCaseHistoryEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["review", "field_validation", "referral", "correction"]),
  type_label: z.string(),
  timestamp: z.iso.datetime({ offset: true }),
  actor: z.string(),
  fields: z.array(z.object({
    label: z.string(),
    value: z.string().nullable(),
  })),
  notes: z.string().nullable().optional(),
});

export const reportCaseHistorySchema = z.object({
  entries: z.array(reportCaseHistoryEntrySchema),
  available: z.boolean(),
  sources: z.object({
    review_events: z.boolean(),
    corrections: z.boolean(),
    assignments: z.boolean(),
    consults: z.boolean(),
  }),
});

export const reportReviewEventSchema = z.object({
  id: z.number().int().positive(),
  actor: userSchema.pick({ uuid: true, name: true }).nullable().optional(),
  action_taken: actionTakenSchema.nullable().optional(),
  authority_classified_condition: authorityClassifiedConditionSchema.nullable().optional(),
  verification_outcome: verificationOutcomeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  case_state: caseStateSchema.nullable().optional(),
  created_at: z.iso.datetime({ offset: true }),
});

export const reportListItemSchema = z.object({
  uuid: z.string(),
  reference_code: z.string(),
  reporter: userSchema.pick({ uuid: true, name: true }),
  barangay: z.string(),
  province: z.string().nullable().optional(),
  municipality: z.string().nullable().optional(),
  observed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  captured_at: z.iso.datetime({ offset: true }),
  submitted_at: z.iso.datetime({ offset: true }),
  first_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  predicted_label: diseaseKeySchema,
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  authority_classified_condition: authorityClassifiedConditionSchema.nullable().optional(),
  reporter_suspected_condition: z.string().nullable().optional(),
  reporter_observation_text: z.string().nullable().optional(),
  action_taken: actionTakenSchema.nullable().optional(),
  farmer_or_farm_owner_name: z.string().nullable().optional(),
  farm_reference: z.string().nullable().optional(),
  field_validation: z.object({
    state: fieldValidationStateSchema,
    assignment_uuid: z.string().nullable().optional(),
    target_visit_date: z.string().nullable(),
    assignee: userSchema.pick({ uuid: true, name: true }).nullable(),
    assigned_by: userSchema.pick({ uuid: true, name: true }).nullable().optional(),
    activated_at: z.iso.datetime({ offset: true }).nullable().optional(),
    updated_at: z.iso.datetime({ offset: true }).nullable().optional(),
  }).optional(),
  latest_validation: z.object({
    visited_at: z.iso.datetime({ offset: true }),
    field_observation: z.string(),
    finding: z.string(),
    action_taken: z.string(),
    follow_up_outcome: followUpOutcomeSchema.nullable().optional(),
    assignee: userSchema.pick({ uuid: true, name: true }).nullable(),
    fresh_photo: z.object({
      available: z.boolean(),
      url: z.string().nullable().optional(),
    }),
  }).nullable().optional(),
  location_unavailable: z.boolean().optional(),
  location_unavailable_reason: locationUnavailableReasonSchema.nullable().optional(),
  affected_area_measurement: measurementProvenanceSchema.optional(),
  affected_portion_measurement: measurementProvenanceSchema.optional(),
  follow_up: z.object({
    due_on: z.string().nullable(),
    overdue: z.boolean(),
  }).optional(),
  mismatch_reported: z.boolean().nullable(),
  machine_facts: reportMachineFactsSchema.optional(),
  attention_band: attentionBandSchema.nullable().optional(),
  attention_band_reasons: z.array(z.string()).optional(),
  identification_gap: identificationGapSchema.optional(),
  expert_consult: expertConsultSummarySchema.nullable().optional(),
  referral: expertConsultSummarySchema.nullable().optional(),
  version: z.number().int().nonnegative().optional(),
  image_url: z.string(),
});

export const reportListResponseSchema = z.object({
  data: z.array(reportListItemSchema),
  links: paginationLinksSchema,
  meta: paginationMetaSchema,
});

export const reportDetailSchema = z.object({
  identity: z.object({
    uuid: z.string(),
    reference_code: z.string(),
    client_uuid: z.string(),
    scan_record_client_uuid: z.string().nullable().optional(),
  }),
  reporter: userSchema,
  barangay: z.string(),
  timestamps: z.object({
    captured_at: z.iso.datetime({ offset: true }),
    observed_at: z.iso.datetime({ offset: true }).nullable().optional(),
    submitted_at: z.iso.datetime({ offset: true }),
  }),
  image: z.object({
    url: z.string(),
    mime_type: z.string(),
    size_bytes: z.number().int().nonnegative(),
    source_type: z.string(),
    source_width: z.number().int().positive().nullable(),
    source_height: z.number().int().positive().nullable(),
  }),
  model: z.object({
    predicted_label: diseaseKeySchema,
    confidence: z.number().min(0).max(1),
    class_scores: z.array(
      z.object({
        label: diseaseKeySchema,
        score: z.number().min(0).max(1),
      }),
    ),
    model_version: z.string(),
    timings_ms: z.object({
      preprocess: z.number().nonnegative(),
      inference: z.number().nonnegative(),
      total: z.number().nonnegative(),
    }),
  }),
  observations: z.object({
    symptom_keys: z.array(z.string()),
    checklist_consistency: z.string(),
    reported_severity: z.string().nullable(),
    quality_warnings: z.array(z.string()),
    sugarcane_variety: z.string().nullable(),
    crop_age: z.string().nullable(),
    cane_class: z.string().nullable(),
    affected_area_hectares: z.number().positive().nullable(),
    affected_area_measurement: measurementProvenanceSchema,
    affected_portion_percent: z.number().min(0).max(100).nullable(),
    affected_portion_measurement: measurementProvenanceSchema,
    field_notes: z.string().nullable(),
    farmer_or_farm_owner_name: z.string().nullable().optional(),
    province: z.string().nullable().optional(),
    municipality: z.string().nullable().optional(),
    final_latitude: z.number().min(-90).max(90).nullable().optional(),
    final_longitude: z.number().min(-180).max(180).nullable().optional(),
    location_source: z.enum(["gps", "manual_map", "unavailable"]).nullable().optional(),
    location_unavailable_reason: locationUnavailableReasonSchema.nullable().optional(),
    gps_accuracy: z.number().nonnegative().nullable().optional(),
  }),
  reporter_observation: z.object({
    mismatch_reported: z.boolean().nullable(),
    reporter_suspected_condition: z.string().max(120).nullable(),
    reporter_observation_text: z.string().max(1000).nullable(),
  }),
  review: z.object({
    status: reviewStatusSchema,
    notes: z.string().nullable(),
    authority_classified_condition: authorityClassifiedConditionSchema.nullable(),
    action_taken: actionTakenSchema.nullable().optional(),
    reviewer: userSchema.pick({ uuid: true, name: true }).nullable().optional(),
    reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  duplicate_linkage: duplicateLinkageSchema.optional(),
  audit: z.object({
    metadata_corrections: z.array(
      z.object({
        id: z.number().int().positive(),
        field: z.string(),
        original_value: z.unknown().nullable(),
        corrected_value: z.unknown().nullable(),
        actor: userSchema.pick({ uuid: true, name: true }),
        created_at: z.iso.datetime({ offset: true }),
        reason: z.string(),
      }),
    ),
    duplicate_linkages: z.array(
      z.object({
        id: z.number().int().positive(),
        canonical_case_uuid: z.string(),
        actor: userSchema.pick({ uuid: true, name: true }),
        created_at: z.iso.datetime({ offset: true }),
        reason: z.string(),
      }),
    ).optional(),
  }).optional(),
  lifecycle: reportLifecycleSchema.optional(),
  machine_facts: reportMachineFactsSchema.optional(),
  first_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  case_history: reportCaseHistorySchema.optional(),
  attention_band: attentionBandSchema.nullable().optional(),
  attention_band_reasons: z.array(z.string()).optional(),
  identification_gap: identificationGapSchema.optional(),
  advisory: advisorySchema.nullable().optional(),
  field_validation_assignment: fieldValidationAssignmentSchema.nullable().optional(),
  referral: reportReferralSchema.nullable().optional(),
  consults: z.array(reportConsultSchema).optional(),
  review_events: z.array(reportReviewEventSchema).optional(),
  version: z.number().int().nonnegative(),
  updated_at: z.iso.datetime({ offset: true }),
});

export const advisoriesResponseSchema = z.object({
  data: z.array(advisorySchema),
});

export const reportDetailResponseSchema = z.object({
  data: reportDetailSchema,
});

export const reviewResponseSchema = reportDetailResponseSchema;

export type ExpertConsultResponseDto = z.infer<typeof expertConsultResponseSchema>;
export type ReportLifecycleDto = z.infer<typeof reportLifecycleSchema>;
export type ReportListItemDto = z.infer<typeof reportListItemSchema>;
export type ReportListResponseDto = z.infer<typeof reportListResponseSchema>;
export type ReportDetailDto = z.infer<typeof reportDetailSchema>;
export type PossibleRecentMatchDto = z.infer<typeof possibleRecentMatchSchema>;
export type PossibleRecentMatchesResponseDto = z.infer<
  typeof possibleRecentMatchesResponseSchema
>;
