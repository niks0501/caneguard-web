import { z } from "zod";
import { reportListItemSchema } from "./report.schema";

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
    recent_reports: z.array(reportListItemSchema),
  }),
});

export type DashboardResponseDto = z.infer<typeof dashboardResponseSchema>;
