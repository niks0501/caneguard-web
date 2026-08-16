import { z } from "zod";
import {
  paginationLinksSchema,
  paginationMetaSchema,
  userSchema,
} from "./common.schema";

export const diseaseKeySchema = z.enum(["healthy", "mosaic", "rust"]);
export const reviewStatusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
]);

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
  review: z.object({
    status: reviewStatusSchema,
    notes: z.string().nullable(),
    reviewer: userSchema.pick({ uuid: true, name: true }).nullable().optional(),
    reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  version: z.number().int().nonnegative(),
  updated_at: z.iso.datetime({ offset: true }),
});

export const reportDetailResponseSchema = z.object({
  data: reportDetailSchema,
});

export const reviewResponseSchema = reportDetailResponseSchema;

export type ReportListItemDto = z.infer<typeof reportListItemSchema>;
export type ReportListResponseDto = z.infer<typeof reportListResponseSchema>;
export type ReportDetailDto = z.infer<typeof reportDetailSchema>;
