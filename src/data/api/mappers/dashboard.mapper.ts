import type {
  DashboardSummary,
  ReportAnalytics,
} from "../../../domain/dashboard.types";
import type { AnalyticsResponseDto } from "../schemas/analytics.schema";
import type { DashboardResponseDto } from "../schemas/dashboard.schema";
import { mapReportListItem } from "./report.mapper";

export function mapReportAnalytics(dto: AnalyticsResponseDto): ReportAnalytics {
  const { data } = dto;

  return {
    period: {
      from: data.period.from,
      to: data.period.to,
      granularity: data.period.granularity,
      label: data.period.label,
      timezone: data.period.timezone,
      timezoneLabel: data.period.timezone_label,
      days: data.period.days,
      partial: data.period.partial,
    },
    totalSubmitted: data.total_submitted,
    series: data.series.map((point) => ({
      label: point.label,
      count: point.count,
    })),
    casesByBarangay: data.cases_by_barangay.map((item) => ({
      barangay: item.barangay,
      reportedCases: item.reported_cases,
    })),
    casesByPossibleCondition: data.cases_by_possible_condition.map((item) => ({
      possibleCondition: item.possible_condition,
      reportedCases: item.reported_cases,
    })),
    caseState: {
      open: data.case_state.open,
      closed: data.case_state.closed,
    },
    comparison: {
      previousFrom: data.comparison.previous_from,
      previousTo: data.comparison.previous_to,
      previousTotal: data.comparison.previous_total,
      currentTotal: data.comparison.current_total,
      delta: data.comparison.delta,
    },
    lifecycle: {
      verificationOutcome: { ...data.lifecycle.verification_outcome },
      fieldValidationState: { ...data.lifecycle.field_validation_state },
      referralState: { ...data.lifecycle.referral_state },
    },
    reportedConcern: data.reported_concern.map((item) => ({ ...item })),
    possibleCondition: data.possible_condition.map((item) => ({ ...item })),
    verificationOutcome: { ...data.verification_outcome },
    validationByBarangay: data.validation_by_barangay.map((item) => ({
      barangay: item.barangay,
      submitted: item.submitted,
      open: item.open,
      pastTargetDate: item.past_target_date,
      scheduled: item.scheduled,
      unscheduled: item.unscheduled,
    })),
    barangayScope: {
      municipality: data.barangay_scope.municipality,
      province: data.barangay_scope.province,
      barangays: [...data.barangay_scope.barangays],
    },
    area: {
      estimatedHectares: data.area.estimated_hectares,
      contributingReports: data.area.contributing_reports,
      measuredReports: data.area.measured_reports,
      measuredHectares: data.area.measured_hectares,
      notMeasuredReports: data.area.not_measured_reports,
      notMeasuredHectares: data.area.not_measured_hectares,
      linkedDuplicatesExcluded: data.area.linked_duplicates_excluded,
      overlapNote: data.area.overlap_note,
    },
    validationWorkload: {
      assignees: data.validation_workload.assignees.map((item) => ({
        assigneeId: item.assignee_id,
        name: item.name,
        openReports: item.open_reports,
      })),
      unassigned: data.validation_workload.unassigned,
    },
    validationSchedule: {
      unscheduled: data.validation_schedule.unscheduled,
      scheduled: data.validation_schedule.scheduled,
      dueToday: data.validation_schedule.due_today,
      pastTargetDate: data.validation_schedule.past_target_date,
      today: data.validation_schedule.today,
    },
    reviewBacklog: {
      totalWaiting: data.review_backlog.total_waiting,
      buckets: data.review_backlog.buckets.map((point) => ({
        label: point.label,
        count: point.count,
      })),
      oldestWaitingDays: data.review_backlog.oldest_waiting_days,
    },
    validationTurnaround: {
      source: data.validation_turnaround.source,
      completed: data.validation_turnaround.completed,
      averageHours: data.validation_turnaround.average_hours,
      medianHours: data.validation_turnaround.median_hours,
      minHours: data.validation_turnaround.min_hours,
      maxHours: data.validation_turnaround.max_hours,
      buckets: data.validation_turnaround.buckets.map((point) => ({
        label: point.label,
        count: point.count,
      })),
    },
  };
}

export function mapDashboard(dto: DashboardResponseDto): DashboardSummary {
  const { counts } = dto.data;

  return {
    totalSubmitted: counts.total_submitted,
    queues: {
      needs_review: dto.data.queues?.needs_review ?? counts.submitted_unverified,
      needs_visit: dto.data.queues?.needs_visit ?? counts.for_field_validation,
      follow_up_due: dto.data.queues?.follow_up_due ?? 0,
      upcoming: dto.data.queues?.upcoming ?? 0,
      unverified_no_active_work: dto.data.queues?.unverified_no_active_work ?? 0,
    },
    riskTriage: dto.data.risk_triage
      ? {
          enabled: dto.data.risk_triage.enabled,
          greenMinConfidence: dto.data.risk_triage.green_min_confidence,
          reviewedCases: dto.data.risk_triage.reviewed_cases,
          calibrationCases: dto.data.risk_triage.calibration_cases,
          greenMisfires: dto.data.risk_triage.green_misfires,
          measuredAt: dto.data.risk_triage.measured_at,
          nextMeasurementDueAt: dto.data.risk_triage.next_measurement_due_at,
          note: dto.data.risk_triage.note,
          bands: dto.data.risk_triage.bands,
        }
      : undefined,
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
          reportsContainingFarmerFarmInformation:
            dto.data.monthly_summary.reports_containing_farmer_farm_information,
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
