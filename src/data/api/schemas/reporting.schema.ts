import { z } from "zod";

export const rateMetricSchema = z.object({
  count: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  rate: z.number().nullable(),
  percentage: z.number().nullable(),
});

export const consultVolumeSchema = z.object({
  total: z.number().int().nonnegative(),
  consulted_cases: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

export const timeToFindingSchema = z.object({
  source: z.string(),
  findings: z.number().int().nonnegative(),
  average_hours: z.number().nullable(),
  median_hours: z.number().nullable(),
  min_hours: z.number().nullable(),
  max_hours: z.number().nullable(),
});

export const advisoryCoverageSchema = z.object({
  consult_cases: z.number().int().nonnegative(),
  cases_with_advisory: z.number().int().nonnegative(),
  coverage_rate: z.number().nullable(),
  delivered_cases: z.number().int().nonnegative(),
  acknowledged_cases: z.number().int().nonnegative(),
});

export const expertVerificationSchema = z.object({
  unable_to_classify_rate: rateMetricSchema,
  consult_volume: consultVolumeSchema,
  time_to_finding: timeToFindingSchema.optional(),
  advisory_coverage: advisoryCoverageSchema.optional(),
  expert_agreement: rateMetricSchema,
  symptom_verification_disagreement: rateMetricSchema,
});

export const monthlyReportSummaryResponseSchema = z.object({
  data: z.object({
    month: z.string(),
    period: z.object({
      from: z.string(),
      to: z.string(),
    }),
    reported_cases: z.number().int().nonnegative().optional(),
    expert_verification: expertVerificationSchema.optional(),
  }).passthrough(),
});

export type ExpertVerificationDto = z.infer<typeof expertVerificationSchema>;
export type MonthlyReportSummaryResponseDto = z.infer<typeof monthlyReportSummaryResponseSchema>;
