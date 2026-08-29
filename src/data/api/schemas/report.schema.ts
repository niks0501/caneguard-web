import { z } from "zod";
import {
  paginationLinksSchema,
  paginationMetaSchema,
  userSchema,
} from "./common.schema";

export const diseaseKeySchema = z.enum(["healthy", "mosaic", "rust"]);
export const authorityClassifiedConditionSchema = z.enum([
  "smut",
  "downy_mildew",
  "mixed_or_multiple",
  "unable_to_classify",
]);
export const reviewStatusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
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
export const fieldValidationAssignmentSchema = z.object({
  uuid: z.string(),
  assignee: userSchema.pick({ uuid: true, name: true }),
  assigned_by: userSchema.pick({ uuid: true, name: true }),
  target_visit_date: z.string().nullable(),
  activated_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
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
  predicted_label: diseaseKeySchema,
  confidence: z.number().min(0).max(1),
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  mismatch_reported: z.boolean().nullable(),
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
    affected_portion_percent: z.number().min(0).max(100).nullable(),
    field_notes: z.string().nullable(),
    farmer_or_farm_owner_name: z.string().nullable().optional(),
    province: z.string().nullable().optional(),
    municipality: z.string().nullable().optional(),
    final_latitude: z.number().min(-90).max(90).nullable().optional(),
    final_longitude: z.number().min(-180).max(180).nullable().optional(),
    location_source: z.enum(["gps", "manual_map"]).nullable().optional(),
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
  field_validation_assignment: fieldValidationAssignmentSchema.nullable().optional(),
  version: z.number().int().nonnegative(),
  updated_at: z.iso.datetime({ offset: true }),
});

export const reportDetailResponseSchema = z.object({
  data: reportDetailSchema,
});

export const reviewResponseSchema = reportDetailResponseSchema;

export type ReportLifecycleDto = z.infer<typeof reportLifecycleSchema>;
export type ReportListItemDto = z.infer<typeof reportListItemSchema>;
export type ReportListResponseDto = z.infer<typeof reportListResponseSchema>;
export type ReportDetailDto = z.infer<typeof reportDetailSchema>;
export type PossibleRecentMatchDto = z.infer<typeof possibleRecentMatchSchema>;
export type PossibleRecentMatchesResponseDto = z.infer<
  typeof possibleRecentMatchesResponseSchema
>;
