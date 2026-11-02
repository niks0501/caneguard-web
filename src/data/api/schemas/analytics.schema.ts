import { z } from "zod";

export const analyticsParamsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.enum(["day", "week"]).optional(),
  comparison: z.enum(["previous_month"]).optional(),
});

export type AnalyticsParams = z.infer<typeof analyticsParamsSchema>;

const analyticsSeriesPointSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

const analyticsBucketSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

const reviewTimeSchema = z.object({
  source: z.string(),
  reviewed_cases: z.number().int().nonnegative(),
  average_hours: z.number().nonnegative().nullable(),
  median_hours: z.number().nonnegative().nullable(),
  min_hours: z.number().nonnegative().nullable(),
  max_hours: z.number().nonnegative().nullable(),
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
    comparison: z.object({
      previous_from: z.iso.date(),
      previous_to: z.iso.date(),
      previous_total: z.number().int().nonnegative(),
      previous_series: z.array(analyticsSeriesPointSchema).optional(),
      current_series: z.array(analyticsSeriesPointSchema).optional(),
      current_total: z.number().int().nonnegative(),
      delta: z.number().int(),
    }),
    reported_concern: z.array(
      z.object({
        concern: z.string(),
        label: z.string(),
        count: z.number().int().nonnegative(),
        share: z.number().nonnegative(),
      }),
    ),
    possible_condition: z.array(
      z.object({
        condition: z.string(),
        count: z.number().int().nonnegative(),
      }),
    ),
    verification_outcome: z.object({
      not_determined: z.number().int().nonnegative(),
      verified: z.number().int().nonnegative(),
      unable_to_verify: z.number().int().nonnegative(),
    }),
    validation_by_barangay: z.array(
      z.object({
        barangay: z.string(),
        submitted: z.number().int().nonnegative(),
        open: z.number().int().nonnegative(),
        past_target_date: z.number().int().nonnegative(),
        scheduled: z.number().int().nonnegative(),
        unscheduled: z.number().int().nonnegative(),
      }),
    ),
    barangay_scope: z.object({
      municipality: z.string(),
      province: z.string(),
      barangays: z.array(z.string()),
    }),
    validation_workload: z.object({
      assignees: z.array(
        z.object({
          assignee_id: z.number().int(),
          name: z.string(),
          open_reports: z.number().int().nonnegative(),
        }),
      ),
      unassigned: z.number().int().nonnegative(),
    }),
    review_backlog: z.object({
      total_waiting: z.number().int().nonnegative(),
      past_target: z.number().int().nonnegative(),
      target_days: z.number().int().positive(),
      buckets: z.array(analyticsBucketSchema),
      oldest_waiting_days: z.number().int().nonnegative().nullable(),
    }),
    validation_turnaround: z.object({
      source: z.string(),
      completed: z.number().int().nonnegative(),
      within_target: z.number().int().nonnegative(),
      target_days: z.number().int().positive(),
      average_hours: z.number().nonnegative().nullable(),
      median_hours: z.number().nonnegative().nullable(),
      min_hours: z.number().nonnegative().nullable(),
      max_hours: z.number().nonnegative().nullable(),
      buckets: z.array(analyticsBucketSchema),
    }),
    review_time: z.object({
      target_days: z.number().int().positive(),
      current: reviewTimeSchema,
      previous: reviewTimeSchema,
    }),
  }),
});

export type AnalyticsResponseDto = z.infer<typeof analyticsResponseSchema>;
