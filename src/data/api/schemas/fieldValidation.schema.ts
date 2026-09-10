import { z } from "zod";
import {
  diseaseKeySchema,
  reportLifecycleSchema,
  reviewStatusSchema,
} from "./report.schema";

const nullableLocationSourceSchema = z
  .enum(["gps", "manual_map"])
  .nullable();

const sharedItemFields = {
  uuid: z.string(),
  reference_code: z.string(),
  barangay: z.string(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  submitted_at: z.iso.datetime({ offset: true }),
  predicted_label: diseaseKeySchema,
  confidence: z.number().min(0).max(1),
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  target_visit_date: z.iso.date().nullable().optional(),
  final_latitude: z.number().min(-90).max(90).nullable(),
  final_longitude: z.number().min(-180).max(180).nullable(),
  location_source: nullableLocationSourceSchema,
  gps_accuracy: z.number().nonnegative().nullable(),
  affected_area_hectares: z.number().positive().nullable(),
  affected_portion_percent: z.number().min(0).max(100).nullable(),
};

export const mapFeaturePropertiesSchema = z.object({
  uuid: z.string(),
  reference_code: z.string(),
  barangay: z.string(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  submitted_at: z.iso.datetime({ offset: true }),
  predicted_label: diseaseKeySchema,
  confidence: z.number().min(0).max(1),
  review_status: reviewStatusSchema,
  lifecycle: reportLifecycleSchema.optional(),
  location_source: nullableLocationSourceSchema,
  gps_accuracy: z.number().nonnegative().nullable(),
  affected_area_hectares: z.number().positive().nullable(),
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
    limit: z.number().int().positive(),
    returned_count: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
});

export const fieldValidationQueueItemSchema = z.object(sharedItemFields);

export const fieldValidationQueueResponseSchema = z.object({
  data: z.object({
    queue: z.enum(["needs_visit", "follow_up_due"]).optional(),
    count: z.number().int().nonnegative(),
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
