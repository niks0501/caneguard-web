import { z } from "zod";
import { reportListItemSchema } from "./report.schema";

const dashboardQueueCountsSchema = z.object({
  needs_review: z.number().int().nonnegative(),
  needs_visit: z.number().int().nonnegative(),
  follow_up_due: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative().optional(),
  unverified_no_active_work: z.number().int().nonnegative().optional(),
});

const riskTriageSchema = z.object({
  enabled: z.boolean(),
  green_min_confidence: z.number().min(0).nullable(),
  reviewed_cases: z.number().int().nonnegative(),
  calibration_cases: z.number().int().nonnegative(),
  green_misfires: z.number().int().nonnegative(),
  measured_at: z.iso.datetime({ offset: true }),
  next_measurement_due_at: z.iso.datetime({ offset: true }),
  note: z.string(),
  bands: z.object({
    green: z.number().int().nonnegative(),
    amber: z.number().int().nonnegative(),
    red: z.number().int().nonnegative(),
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
    risk_triage: riskTriageSchema.optional(),
    // Payload split (overhaul P1): slices without `recent` omit the key.
    recent_reports: z.array(reportListItemSchema).optional().default([]),
  }),
});

export type DashboardResponseDto = z.infer<typeof dashboardResponseSchema>;
