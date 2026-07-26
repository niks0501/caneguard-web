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
  }),
  reporter: userSchema,
  barangay: z.string(),
  timestamps: z.object({
    captured_at: z.iso.datetime({ offset: true }),
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
