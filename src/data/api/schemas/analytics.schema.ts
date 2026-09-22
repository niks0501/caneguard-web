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

const analyticsBucketSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
});

const lifecycleDistributionSchema = z.record(z.string(), z.number().int().nonnegative());

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
    lifecycle: z.object({
      verification_outcome: lifecycleDistributionSchema,
      field_validation_state: lifecycleDistributionSchema,
      referral_state: lifecycleDistributionSchema,
    }),
    area: z.object({
      estimated_hectares: z.number().nonnegative(),
      contributing_reports: z.number().int().nonnegative(),
      measured_reports: z.number().int().nonnegative(),
      measured_hectares: z.number().nonnegative(),
      not_measured_reports: z.number().int().nonnegative(),
      not_measured_hectares: z.number().nonnegative(),
      linked_duplicates_excluded: z.number().int().nonnegative(),
      overlap_note: z.string(),
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
    validation_schedule: z.object({
      unscheduled: z.number().int().nonnegative(),
      scheduled: z.number().int().nonnegative(),
      due_today: z.number().int().nonnegative(),
      past_target_date: z.number().int().nonnegative(),
      today: z.iso.date(),
    }),
    review_backlog: z.object({
      total_waiting: z.number().int().nonnegative(),
      buckets: z.array(analyticsBucketSchema),
      oldest_waiting_days: z.number().int().nonnegative().nullable(),
    }),
    validation_turnaround: z.object({
      source: z.string(),
      completed: z.number().int().nonnegative(),
      average_hours: z.number().nonnegative().nullable(),
      median_hours: z.number().nonnegative().nullable(),
      min_hours: z.number().nonnegative().nullable(),
      max_hours: z.number().nonnegative().nullable(),
      buckets: z.array(analyticsBucketSchema),
    }),
  }),
});

export type AnalyticsResponseDto = z.infer<typeof analyticsResponseSchema>;
