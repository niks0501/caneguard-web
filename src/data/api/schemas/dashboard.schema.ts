import { z } from "zod";
import { diseaseKeySchema, reportListItemSchema } from "./report.schema";

const dashboardQueueCountsSchema = z.object({
  needs_review: z.number().int().nonnegative(),
  needs_visit: z.number().int().nonnegative(),
  follow_up_due: z.number().int().nonnegative(),
});

const monthlyCaseSummarySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  period: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
  }),
  reported_cases: z.number().int().nonnegative(),
  cases_by_barangay: z.array(z.object({
    barangay: z.string(),
    reported_cases: z.number().int().nonnegative(),
  })),
  cases_by_possible_condition: z.array(z.object({
    possible_condition: diseaseKeySchema,
    reported_cases: z.number().int().nonnegative(),
  })),
  estimated_affected_hectares: z.number().nonnegative(),
  field_validation_counts: z.object({
    unassigned: z.number().int().nonnegative(),
    assigned: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    requiring_validation: z.number().int().nonnegative(),
  }),
  closed_cases: z.number().int().nonnegative(),
  review_time: z.object({
    source: z.string(),
    reviewed_cases: z.number().int().nonnegative(),
    average_hours: z.number().nonnegative().nullable(),
    median_hours: z.number().nonnegative().nullable(),
    min_hours: z.number().nonnegative().nullable(),
    max_hours: z.number().nonnegative().nullable(),
  }),
});

export const dashboardResponseSchema = z.object({
  data: z.object({
    counts: z.object({
      total_submitted: z.number().int().nonnegative(),
      submitted_unverified: z.number().int().nonnegative(),
      for_field_validation: z.number().int().nonnegative(),
      verified_by_staff: z.number().int().nonnegative(),
      unable_to_verify: z.number().int().nonnegative(),
      resolved: z.number().int().nonnegative(),
    }),
    queues: dashboardQueueCountsSchema.optional(),
    recent_reports: z.array(reportListItemSchema),
    monthly_summary: monthlyCaseSummarySchema.optional(),
  }),
});

export type MonthlyCaseSummaryDto = z.infer<typeof monthlyCaseSummarySchema>;
export type DashboardResponseDto = z.infer<typeof dashboardResponseSchema>;
