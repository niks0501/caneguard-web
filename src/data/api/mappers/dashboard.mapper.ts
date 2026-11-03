import type {
  ConditionTrend,
  ConditionTrendGroup,
  DashboardSummary,
  ReportAnalytics,
  ReviewTime,
} from "../../../domain/dashboard.types";
import type { AnalyticsResponseDto } from "../schemas/analytics.schema";
import type { DashboardResponseDto } from "../schemas/dashboard.schema";
import { mapReportListItem } from "./report.mapper";

function mapConditionTrend(
  dto: AnalyticsResponseDto["data"]["series_by_condition"]["staff_classification"]["unclassified"],
): ConditionTrend {
  return {
    condition: dto.condition,
    total: dto.total,
    previousTotal: dto.previous_total,
    rising: dto.rising,
    series: dto.series.map((point) => ({ label: point.label, count: point.count })),
  };
}

function mapConditionTrendGroup(
  dto: AnalyticsResponseDto["data"]["series_by_condition"]["staff_classification"],
): ConditionTrendGroup {
  return {
    conditions: dto.conditions.map(mapConditionTrend),
    unclassified: mapConditionTrend(dto.unclassified),
  };
}

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
    comparison: {
      previousFrom: data.comparison.previous_from,
      previousTo: data.comparison.previous_to,
      previousTotal: data.comparison.previous_total,
      previousSeries: data.comparison.previous_series?.map((point) => ({ ...point })),
      currentSeries: data.comparison.current_series?.map((point) => ({ ...point })),
      currentTotal: data.comparison.current_total,
      delta: data.comparison.delta,
    },
    risingRule: { ratio: data.rising_rule.ratio, minCases: data.rising_rule.min_cases },
    seriesByCondition: {
      staffClassification: mapConditionTrendGroup(data.series_by_condition.staff_classification),
      possibleCondition: mapConditionTrendGroup(data.series_by_condition.possible_condition),
    },
    seriesByBarangay: {
      topN: data.series_by_barangay.top_n,
      rows: data.series_by_barangay.rows.map((row) => ({
        barangay: row.barangay,
        total: row.total,
        previousTotal: row.previous_total,
        delta: row.delta,
        rising: row.rising,
      })),
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
    validationWorkload: {
      assignees: data.validation_workload.assignees.map((item) => ({
        assigneeId: item.assignee_id,
        name: item.name,
        openReports: item.open_reports,
      })),
      unassigned: data.validation_workload.unassigned,
    },
    reviewBacklog: {
      totalWaiting: data.review_backlog.total_waiting,
      pastTarget: data.review_backlog.past_target,
      targetDays: data.review_backlog.target_days,
      buckets: data.review_backlog.buckets.map((point) => ({
        label: point.label,
        count: point.count,
      })),
      oldestWaitingDays: data.review_backlog.oldest_waiting_days,
    },
    validationTurnaround: {
      source: data.validation_turnaround.source,
      completed: data.validation_turnaround.completed,
      withinTarget: data.validation_turnaround.within_target,
      targetDays: data.validation_turnaround.target_days,
      averageHours: data.validation_turnaround.average_hours,
      medianHours: data.validation_turnaround.median_hours,
      minHours: data.validation_turnaround.min_hours,
      maxHours: data.validation_turnaround.max_hours,
      buckets: data.validation_turnaround.buckets.map((point) => ({
        label: point.label,
        count: point.count,
      })),
    },
    reviewTime: {
      targetDays: data.review_time.target_days,
      current: mapReviewTime(data.review_time.current),
      previous: mapReviewTime(data.review_time.previous),
    },
  };
}

function mapReviewTime(dto: AnalyticsResponseDto["data"]["review_time"]["current"]): ReviewTime {
  return {
    source: dto.source,
    reviewedCases: dto.reviewed_cases,
    averageHours: dto.average_hours,
    medianHours: dto.median_hours,
    minHours: dto.min_hours,
    maxHours: dto.max_hours,
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
  };
}
