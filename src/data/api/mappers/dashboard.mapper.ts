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
    monthlySummary: dto.data.monthly_summary
      ? {
          month: dto.data.monthly_summary.month,
          period: dto.data.monthly_summary.period,
          reportedCases: dto.data.monthly_summary.reported_cases,
          casesByBarangay: dto.data.monthly_summary.cases_by_barangay.map((item) => ({
            barangay: item.barangay,
            reportedCases: item.reported_cases,
          })),
          casesByPossibleCondition:
            dto.data.monthly_summary.cases_by_possible_condition.map((item) => ({
              possibleCondition: item.possible_condition,
              reportedCases: item.reported_cases,
            })),
          estimatedAffectedHectares:
            dto.data.monthly_summary.estimated_affected_hectares,
          fieldValidationCounts: {
            unassigned: dto.data.monthly_summary.field_validation_counts.unassigned,
            assigned: dto.data.monthly_summary.field_validation_counts.assigned,
            inProgress: dto.data.monthly_summary.field_validation_counts.in_progress,
            completed: dto.data.monthly_summary.field_validation_counts.completed,
            requiringValidation:
              dto.data.monthly_summary.field_validation_counts.requiring_validation,
          },
          closedCases: dto.data.monthly_summary.closed_cases,
          reviewTime: {
            source: dto.data.monthly_summary.review_time.source,
            reviewedCases: dto.data.monthly_summary.review_time.reviewed_cases,
            averageHours: dto.data.monthly_summary.review_time.average_hours,
            medianHours: dto.data.monthly_summary.review_time.median_hours,
            minHours: dto.data.monthly_summary.review_time.min_hours,
            maxHours: dto.data.monthly_summary.review_time.max_hours,
          },
        }
      : undefined,
  };
}
