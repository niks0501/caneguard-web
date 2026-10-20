import { z } from "zod";
import { FIELD_SURVEYS_MAX_LIMIT } from "../../../domain/fieldSurvey.types";

const positionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const linearRingSchema = z.array(positionSchema).min(4).superRefine((positions, context) => {
  const first = positions[0];
  const last = positions.at(-1);
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    context.addIssue({ code: "custom", message: "Polygon rings must be closed." });
  }
  if (new Set(positions.slice(0, -1).map(([longitude, latitude]) => `${longitude},${latitude}`)).size < 3) {
    context.addIssue({ code: "custom", message: "Polygon rings must contain at least three distinct positions." });
  }
});

export const fieldSurveyFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1),
  geometry: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(linearRingSchema).min(1),
  }),
  properties: z.object({
    id: z.number().int().positive(),
    captured_at: z.iso.datetime({ offset: true }),
    area_sqm: z.number().nonnegative(),
    area_source: z.literal("device_reported"),
    inspector: z.object({
      uuid: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
});

export const fieldSurveyBoundariesResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(fieldSurveyFeatureSchema),
  metadata: z.object({
    total_count: z.number().int().nonnegative(),
    returned_count: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(FIELD_SURVEYS_MAX_LIMIT),
    truncated: z.boolean(),
  }),
}).superRefine((response, context) => {
  const { features, metadata } = response;
  if (features.length !== metadata.returned_count) {
    context.addIssue({
      code: "custom",
      path: ["metadata", "returned_count"],
      message: "returned_count must match the number of features.",
    });
  }
  if (metadata.returned_count > metadata.limit) {
    context.addIssue({
      code: "custom",
      path: ["metadata", "returned_count"],
      message: "returned_count cannot exceed the response limit.",
    });
  }
  if (metadata.truncated && metadata.returned_count !== metadata.limit) {
    context.addIssue({
      code: "custom",
      path: ["metadata", "truncated"],
      message: "Truncated responses must fill the requested limit.",
    });
  }
  if (!metadata.truncated && metadata.returned_count < Math.min(metadata.total_count, metadata.limit)) {
    context.addIssue({
      code: "custom",
      path: ["metadata", "truncated"],
      message: "Untruncated responses must include all available rows up to the limit.",
    });
  }
});

export type FieldSurveyFeatureDto = z.infer<typeof fieldSurveyFeatureSchema>;
export type FieldSurveyBoundariesResponseDto = z.infer<typeof fieldSurveyBoundariesResponseSchema>;
