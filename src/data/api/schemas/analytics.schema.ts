import { z } from "zod";
import { diseaseKeySchema } from "./report.schema";

export const analyticsParamsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.enum(["day", "week"]).optional(),
});

export type AnalyticsParams = z.infer<typeof analyticsParamsSchema>;

const analyticsSeriesPointSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const analyticsResponseSchema = z.object({
  data: z.object({
    period: z.object({
      from: z.iso.date(),
      to: z.iso.date(),
      granularity: z.enum(["day", "week"]),
      label: z.string(),
      timezone: z.string(),
      timezone_label: z.string(),
      days: z.number().int().nonnegative(),
      partial: z.boolean(),
    }),
    filters: z.record(z.string(), z.unknown()).optional().default({}),
    total_submitted: z.number().int().nonnegative(),
    series: z.array(analyticsSeriesPointSchema),
    cases_by_barangay: z.array(
      z.object({
        barangay: z.string(),
        reported_cases: z.number().int().nonnegative(),
      }),
    ),
    cases_by_possible_condition: z.array(
      z.object({
        possible_condition: diseaseKeySchema,
        reported_cases: z.number().int().nonnegative(),
      }),
    ),
    case_state: z.object({
      open: z.number().int().nonnegative(),
      closed: z.number().int().nonnegative(),
    }),
    comparison: z.object({
      previous_from: z.iso.date(),
      previous_to: z.iso.date(),
      previous_total: z.number().int().nonnegative(),
      current_total: z.number().int().nonnegative(),
      delta: z.number().int(),
    }),
  }),
});

export type AnalyticsResponseDto = z.infer<typeof analyticsResponseSchema>;
