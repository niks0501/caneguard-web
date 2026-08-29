import type { DashboardSummary } from "../../../domain/dashboard.types";
import type { DashboardResponseDto } from "../schemas/dashboard.schema";
import { mapReportListItem } from "./report.mapper";

export function mapDashboard(dto: DashboardResponseDto): DashboardSummary {
  const { counts } = dto.data;

  return {
    totalSubmitted: counts.total_submitted,
    queues: dto.data.queues ?? {
      needs_review: counts.submitted_unverified,
      needs_visit: counts.for_field_validation,
      follow_up_due: 0,
    },
    counts: {
      submitted_unverified: counts.submitted_unverified,
      for_field_validation: counts.for_field_validation,
      verified_by_staff: counts.verified_by_staff,
      unable_to_verify: counts.unable_to_verify,
      resolved: counts.resolved,
    },
    recentReports: dto.data.recent_reports.map(mapReportListItem),
  };
}
