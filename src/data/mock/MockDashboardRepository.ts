import type {
  DashboardRepository,
} from "../contracts/DashboardRepository";
import type {
  DashboardSummary,
  MonthlyCaseSummary,
  ReportAnalytics,
  ReportAnalyticsParams,
} from "../../domain/dashboard.types";
import type { DiseaseReport, ReviewStatus } from "../../domain/report.types";
import { manilaDateAt, manilaMonthAt } from "../../domain/reportingTime";
import { operationalQueueValues } from "../../domain/operationalQueue";
import {
  legacyLifecycleForReviewStatus,
} from "../api/mappers/lifecycle.mapper";
import { filterMockOperationalQueue, isCanonicalWorkReport } from "./mockOperationalQueues";
import { mockReports } from "./mockReports";

function buildMonthlySummary(
  reports: DiseaseReport[],
  month: string,
): MonthlyCaseSummary {
  const monthlyReports = reports.filter((report) =>
    isCanonicalWorkReport(report)
    && manilaMonthAt(new Date(report.submittedAt)) === month,
  );
  const byBarangay = new Map<string, number>();
  const byCondition = new Map<string, number>();
  const fieldValidationCounts = {
    unassigned: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
    requiringValidation: 0,
  };

  monthlyReports.forEach((report) => {
    byBarangay.set(
      report.barangay,
      (byBarangay.get(report.barangay) ?? 0) + 1,
    );
    byCondition.set(
      report.predictedDisease,
      (byCondition.get(report.predictedDisease) ?? 0) + 1,
    );
    const lifecycle = report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);
    const stateKey = {
      unassigned: "unassigned",
      assigned: "assigned",
      in_progress: "inProgress",
      completed: "completed",
    }[lifecycle.fieldValidationState] as keyof typeof fieldValidationCounts;
    fieldValidationCounts[stateKey] += 1;
    if (["assigned", "in_progress"].includes(lifecycle.fieldValidationState)) {
      fieldValidationCounts.requiringValidation += 1;
    }
  });

  const durations = monthlyReports
    .filter((report) => report.reviewedAt)
    .map((report) =>
      (new Date(report.reviewedAt!).getTime() - new Date(report.submittedAt).getTime()) /
      3_600_000,
    )
    .filter((hours) => hours >= 0)
    .sort((first, second) => first - second);
  const reviewedCases = durations.length;
  const middle = Math.floor(reviewedCases / 2);
  const medianHours = reviewedCases === 0
    ? null
    : reviewedCases % 2 === 0
      ? (durations[middle - 1] + durations[middle]) / 2
      : durations[middle];
  const lifecycleFor = (report: DiseaseReport) =>
    report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);

  return {
    month,
    period: {
      from: `${month}-01`,
      to: new Date(Date.UTC(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      )).toISOString().slice(0, 10),
    },
    reportedCases: monthlyReports.length,
    casesByBarangay: [...byBarangay.entries()]
      .map(([barangay, reportedCases]) => ({ barangay, reportedCases }))
      .sort((first, second) => second.reportedCases - first.reportedCases),
    casesByPossibleCondition: [...byCondition.entries()]
      .map(([possibleCondition, reportedCases]) => ({
        possibleCondition: possibleCondition as DiseaseReport["predictedDisease"],
        reportedCases,
      }))
      .sort((first, second) => second.reportedCases - first.reportedCases),
    estimatedAffectedHectares: Number(monthlyReports
      .reduce((total, report) => total + (report.affectedAreaHectares ?? 0), 0)
      .toFixed(2)),
    reportsContainingFarmerFarmInformation: monthlyReports.filter((report) =>
      Boolean(report.farmReference?.trim() || report.farmerOrFarmOwnerName?.trim()),
    ).length,
    fieldValidationCounts,
    closedCases: monthlyReports.filter((report) =>
      lifecycleFor(report).caseState === "closed",
    ).length,
    reviewTime: {
      source: "submitted_at_to_reviewed_at",
      reviewedCases,
      averageHours: reviewedCases
        ? Number((durations.reduce((total, hours) => total + hours, 0) / reviewedCases).toFixed(2))
        : null,
      medianHours: medianHours === null ? null : Number(medianHours.toFixed(2)),
      minHours: reviewedCases ? Number(durations[0].toFixed(2)) : null,
      maxHours: reviewedCases ? Number(durations[reviewedCases - 1].toFixed(2)) : null,
    },
  };
}

export class MockDashboardRepository implements DashboardRepository {
  async getSummary(month?: string): Promise<DashboardSummary> {
    const counts: Record<ReviewStatus, number> = {
      submitted_unverified: 0,
      for_field_validation: 0,
      verified_by_staff: 0,
      unable_to_verify: 0,
      resolved: 0,
    };
    const canonicalReports = mockReports.filter(isCanonicalWorkReport);
    canonicalReports.forEach((report) => {
      counts[report.reviewStatus] += 1;
    });
    const today = manilaDateAt();
    const queues = Object.fromEntries(operationalQueueValues.map((queue) => [
      queue,
      filterMockOperationalQueue(canonicalReports, queue, today).length,
    ])) as DashboardSummary["queues"];

    const selectedMonth = month ?? manilaMonthAt();

    return {
      totalSubmitted: canonicalReports.length,
      counts,
      queues,
      recentReports: canonicalReports.slice(0, 5),
      monthlySummary: buildMonthlySummary(canonicalReports, selectedMonth),
    };
  }

  async getAnalytics(params: ReportAnalyticsParams): Promise<ReportAnalytics> {
    return {
      period: {
        from: params.from,
        to: params.to,
        granularity: params.granularity ?? "week",
        label: `${params.from} – ${params.to}`,
        timezone: "Asia/Manila",
        timezoneLabel: "PHT (UTC+8)",
        days: 0,
        partial: false,
      },
      totalSubmitted: 0,
      series: [],
      casesByBarangay: [],
      casesByPossibleCondition: [],
      caseState: { open: 0, closed: 0 },
      comparison: {
        previousFrom: params.from,
        previousTo: params.from,
        previousTotal: 0,
        currentTotal: 0,
        delta: 0,
      },
      lifecycle: {
        verificationOutcome: {},
        fieldValidationState: {},
        referralState: {},
      },
      area: {
        estimatedHectares: 0,
        contributingReports: 0,
        measuredReports: 0,
        measuredHectares: 0,
        notMeasuredReports: 0,
        notMeasuredHectares: 0,
        linkedDuplicatesExcluded: 0,
        overlapNote: "Estimates may overlap where submitted reports describe the same ground.",
      },
      validationWorkload: { assignees: [], unassigned: 0 },
      validationSchedule: {
        unscheduled: 0,
        scheduled: 0,
        dueToday: 0,
        pastTargetDate: 0,
        today: params.to,
      },
      reviewBacklog: { totalWaiting: 0, buckets: [], oldestWaitingDays: null },
      validationTurnaround: {
        source: "activated_at_to_visited_at",
        completed: 0,
        averageHours: null,
        medianHours: null,
        minHours: null,
        maxHours: null,
        buckets: [],
      },
    };
  }
}
