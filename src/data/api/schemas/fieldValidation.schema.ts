import { z } from "zod";
import {
  actionTakenSchema,
  authorityClassifiedConditionSchema,
  diseaseKeySchema,
  locationUnavailableReasonSchema,
  measurementProvenanceSchema,
  reportLifecycleSchema,
  reviewStatusSchema,
} from "./report.schema";

const nullableLocationSourceSchema = z
  .enum(["gps", "manual_map", "unavailable"])
  .nullable();

const sharedItemFields = {
  uuid: z.string(),
  version: z.number().int().nonnegative().optional(),
  reference_code: z.string(),
  barangay: z.string(),
  farm_reference: z.string().nullable().optional(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  submitted_at: z.iso.datetime({ offset: true }),
  first_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  predicted_label: diseaseKeySchema,
  confidence: z.number().min(0).max(1),
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  authority_classified_condition: authorityClassifiedConditionSchema.nullable().optional(),
  action_taken: actionTakenSchema.nullable().optional(),
  mismatch_reported: z.boolean().nullable().optional(),
  scheduled_revisit: z.boolean().optional(),
  affected_area_measurement: measurementProvenanceSchema.optional(),
  target_visit_date: z.iso.date().nullable().optional(),
  assignee: z
    .object({
      uuid: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  final_latitude: z.number().min(-90).max(90).nullable(),
  final_longitude: z.number().min(-180).max(180).nullable(),
  location_source: nullableLocationSourceSchema,
  location_unavailable: z.boolean().optional(),
  location_unavailable_reason: locationUnavailableReasonSchema.nullable().optional(),
  gps_accuracy: z.number().nonnegative().nullable(),
  affected_area_hectares: z.number().positive().nullable(),
  affected_portion_percent: z.number().min(0).max(100).nullable(),
};

export const mapFeaturePropertiesSchema = z.object({
  uuid: z.string(),
  location_group_key: z.string().min(1).optional(),
  location_group_size: z.number().int().positive().optional(),
  location_group_coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
  reference_code: z.string(),
  barangay: z.string(),
  farm_reference: z.string().nullable().optional(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  submitted_at: z.iso.datetime({ offset: true }),
  first_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  predicted_label: diseaseKeySchema,
  confidence: z.number().min(0).max(1),
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  authority_classified_condition: authorityClassifiedConditionSchema.nullable().optional(),
  action_taken: actionTakenSchema.nullable().optional(),
  mismatch_reported: z.boolean().nullable().optional(),
  scheduled_revisit: z.boolean().optional(),
  location_source: nullableLocationSourceSchema,
  location_unavailable: z.boolean().optional(),
  gps_accuracy: z.number().nonnegative().nullable(),
  affected_area_hectares: z.number().positive().nullable(),
  affected_area_measurement: measurementProvenanceSchema.optional(),
  affected_portion_percent: z.number().min(0).max(100).nullable(),
});

export const mapFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  properties: mapFeaturePropertiesSchema,
});

export const mapResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(mapFeatureSchema),
  metadata: z.object({
    total_count: z.number().int().nonnegative(),
    located_count: z.number().int().nonnegative(),
    unlocated_count: z.number().int().nonnegative(),
    need_visit_count: z.number().int().nonnegative().optional(),
    overdue_count: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive(),
    returned_count: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
});

export const fieldValidationQueueItemSchema = z.object(sharedItemFields);

export const fieldValidationQueueResponseSchema = z.object({
  data: z.object({
    queue: z.enum(["needs_visit", "follow_up_due", "upcoming"]).optional(),
    count: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().optional(),
    page: z.number().int().positive().optional(),
    per_page: z.number().int().positive().optional(),
    oldest: fieldValidationQueueItemSchema.nullable(),
    items: z.array(fieldValidationQueueItemSchema),
  }),
});

export type MapResponseDto = z.infer<typeof mapResponseSchema>;
export type FieldValidationQueueItemDto = z.infer<
  typeof fieldValidationQueueItemSchema
>;
export type FieldValidationQueueResponseDto = z.infer<
  typeof fieldValidationQueueResponseSchema
>;
