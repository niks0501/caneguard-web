import { z } from "zod";

export const monthlyReportSummaryResponseSchema = z.object({
  data: z.object({
    month: z.string(),
    period: z.object({
      from: z.string(),
      to: z.string(),
    }),
    reported_cases: z.number().int().nonnegative().optional(),
  }).passthrough(),
});

export type MonthlyReportSummaryResponseDto = z.infer<typeof monthlyReportSummaryResponseSchema>;
