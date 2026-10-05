import type {
  DashboardRepository,
  DashboardSummaryOptions,
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

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function dateDifference(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
}

function mondayFor(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

function reportDate(report: DiseaseReport) {
  return manilaDateAt(new Date(report.submittedAt));
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()];
}

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
  async getSummary(month?: string, options?: DashboardSummaryOptions): Promise<DashboardSummary> {
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
      recentReports: canonicalReports.slice(0, options?.recentLimit ?? 10),
      monthlySummary: buildMonthlySummary(canonicalReports, selectedMonth),
    };
  }

  async getAnalytics(params: ReportAnalyticsParams): Promise<ReportAnalytics> {
    const granularity = params.granularity ?? "week";
    const days = Math.max(1, dateDifference(params.from, params.to) + 1);
    const previousTo = shiftDate(params.from, -1);
    const previousFrom = shiftDate(previousTo, -days + 1);
    const isInRange = (report: DiseaseReport, from: string, to: string) => {
      const date = reportDate(report);
      return date >= from && date <= to;
    };
    const reportsInRange = mockReports.filter((report) =>
      isInRange(report, params.from, params.to),
    );
    const reports = reportsInRange.filter(isCanonicalWorkReport);
    const previousReports = mockReports
      .filter((report) => isInRange(report, previousFrom, previousTo))
      .filter(isCanonicalWorkReport);
    const lifecycleFor = (report: DiseaseReport) =>
      report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);

    const series = new Map<string, number>();
    for (let date = params.from; date <= params.to; date = shiftDate(date, 1)) {
      const bucket = granularity === "week" ? mondayFor(date) : date;
      series.set(bucket, 0);
    }
    reports.forEach((report) => {
      const date = reportDate(report);
      const bucket = granularity === "week" ? mondayFor(date) : date;
      series.set(bucket, (series.get(bucket) ?? 0) + 1);
    });

    const lifecycleCounts = {
      verificationOutcome: {} as Record<string, number>,
      fieldValidationState: {} as Record<string, number>,
    };
    const caseState = { open: 0, closed: 0 };
    reports.forEach((report) => {
      const lifecycle = lifecycleFor(report);
      lifecycleCounts.verificationOutcome[lifecycle.verificationOutcome] =
        (lifecycleCounts.verificationOutcome[lifecycle.verificationOutcome] ?? 0) + 1;
      lifecycleCounts.fieldValidationState[lifecycle.fieldValidationState] =
        (lifecycleCounts.fieldValidationState[lifecycle.fieldValidationState] ?? 0) + 1;
      caseState[lifecycle.caseState] += 1;
    });

    const areaReports = reports.filter(
      (report) => report.affectedAreaHectares !== undefined,
    );
    const measuredReports = areaReports.filter(
      (report) => report.affectedAreaMeasurement !== "not_measured",
    );
    const notMeasuredReports = areaReports.filter(
      (report) => report.affectedAreaMeasurement === "not_measured",
    );
    const sumArea = (items: DiseaseReport[]) => Number(items
      .reduce((total, report) => total + (report.affectedAreaHectares ?? 0), 0)
      .toFixed(2));

    const openValidation = reports.filter((report) => {
      const lifecycle = lifecycleFor(report);
      return lifecycle.caseState === "open" &&
        lifecycle.fieldValidationState !== "completed" &&
        report.reviewStatus === "for_field_validation";
    });
    const workload = new Map<number, { assigneeId: number; name: string; openReports: number }>();
    let unassigned = 0;
    const schedule = { unscheduled: 0, scheduled: 0, dueToday: 0, pastTargetDate: 0 };
    const today = manilaDateAt();
    openValidation.forEach((report, index) => {
      const assignment = report.fieldValidationAssignment;
      if (assignment?.assignee) {
        const assigneeId = Number(assignment.assignee.uuid.slice(-3)) || index + 1;
        const current = workload.get(assigneeId) ?? {
          assigneeId,
          name: assignment.assignee.name,
          openReports: 0,
        };
        current.openReports += 1;
        workload.set(assigneeId, current);
      } else {
        unassigned += 1;
      }
      const target = assignment?.targetVisitDate;
      if (!target) schedule.unscheduled += 1;
      else if (target < today) schedule.pastTargetDate += 1;
      else if (target === today) schedule.dueToday += 1;
      else schedule.scheduled += 1;
    });

    const waitingReports = reports.filter((report) => {
      const lifecycle = lifecycleFor(report);
      return lifecycle.caseState === "open" &&
        lifecycle.verificationOutcome === "not_determined";
    });
    const backlogBuckets = [
      { label: "0–2 days waiting", min: 0, max: 2, count: 0 },
      { label: "3–6 days waiting", min: 3, max: 6, count: 0 },
      { label: "7–13 days waiting", min: 7, max: 13, count: 0 },
      { label: "14–29 days waiting", min: 14, max: 29, count: 0 },
      { label: "30+ days waiting", min: 30, max: Infinity, count: 0 },
    ];
    const now = manilaDateAt();
    const waitingDays = waitingReports.map((report) =>
      Math.max(0, dateDifference(reportDate(report), now)),
    );
    waitingDays.forEach((age) => {
      const bucket = backlogBuckets.find((item) => age >= item.min && age <= item.max);
      if (bucket) bucket.count += 1;
    });

    const turnaroundHours = reports.flatMap((report) => {
      const activatedAt = report.fieldValidationAssignment?.activatedAt;
      const visitedAt = report.latestValidation?.visitedAt;
      if (!activatedAt || !visitedAt) return [];
      const hours = (Date.parse(visitedAt) - Date.parse(activatedAt)) / 3_600_000;
      return hours >= 0 ? [Number(hours.toFixed(2))] : [];
    }).sort((first, second) => first - second);
    const turnaroundMiddle = Math.floor(turnaroundHours.length / 2);
    const turnaroundMedian = turnaroundHours.length === 0
      ? null
      : turnaroundHours.length % 2 === 0
        ? (turnaroundHours[turnaroundMiddle - 1] + turnaroundHours[turnaroundMiddle]) / 2
        : turnaroundHours[turnaroundMiddle];
    const turnaroundBuckets = [
      { label: "Under 24 hours", count: 0 },
      { label: "1–3 days", count: 0 },
      { label: "3–7 days", count: 0 },
      { label: "Over 7 days", count: 0 },
    ];
    turnaroundHours.forEach((hours) => {
      const index = hours < 24 ? 0 : hours <= 72 ? 1 : hours <= 168 ? 2 : 3;
      turnaroundBuckets[index].count += 1;
    });

    // Decision aggregates (dashboard overhaul P2), mirroring the API shapes.
    const declaredConcerns = ["RSSI", "smut", "mosaic", "rust"] as const;
    const concernCounts: Record<string, number> = {
      RSSI: 0,
      smut: 0,
      mosaic: 0,
      rust: 0,
      other: 0,
      not_stated: 0,
    };
    reports.forEach((report) => {
      const raw = report.reporterSuspectedCondition;
      if (!raw || !raw.trim()) {
        concernCounts.not_stated += 1;
        return;
      }
      const normalised = raw.trim().toLowerCase();
      const canonical = declaredConcerns.find((value) => value.toLowerCase() === normalised);
      concernCounts[canonical ?? "other"] += 1;
    });
    const concernLabels: Record<string, string> = {
      RSSI: "RSSI",
      smut: "Smut",
      mosaic: "Mosaic",
      rust: "Rust",
      other: "Other reported",
      not_stated: "Not stated",
    };
    const reportedConcern = [
      ...declaredConcerns,
      "other",
      "not_stated",
    ].map((concern) => ({
      concern,
      label: concernLabels[concern],
      count: concernCounts[concern],
      share: reports.length > 0 ? Number((concernCounts[concern] / reports.length).toFixed(4)) : 0,
    }));

    const declaredConditions = ["healthy", "mosaic", "rust"];
    const possibleCondition = declaredConditions.map((condition) => ({
      condition,
      count: reports.filter((report) => report.predictedDisease === condition).length,
    }));

    const verificationOutcome = {
      not_determined: lifecycleCounts.verificationOutcome.not_determined ?? 0,
      verified: lifecycleCounts.verificationOutcome.verified ?? 0,
      unable_to_verify: lifecycleCounts.verificationOutcome.unable_to_verify ?? 0,
    };

    const barangayRows = new Map<string, {
      submitted: number;
      open: number;
      pastTargetDate: number;
      scheduled: number;
      unscheduled: number;
    }>();
    const barangayRow = (barangay: string) => {
      const row = barangayRows.get(barangay) ?? {
        submitted: 0,
        open: 0,
        pastTargetDate: 0,
        scheduled: 0,
        unscheduled: 0,
      };
      barangayRows.set(barangay, row);
      return row;
    };
    reports.forEach((report) => {
      barangayRow(report.barangay).submitted += 1;
    });
    openValidation.forEach((report) => {
      const row = barangayRow(report.barangay);
      row.open += 1;
      const target = report.fieldValidationAssignment?.targetVisitDate;
      if (!target) row.unscheduled += 1;
      else if (target < today) row.pastTargetDate += 1;
      else row.scheduled += 1;
    });
    const validationByBarangay = [...barangayRows.entries()]
      .map(([barangay, row]) => ({ barangay, ...row }))
      .sort((first, second) =>
        second.submitted - first.submitted ||
        first.barangay.localeCompare(second.barangay));
    const barangayScope = {
      municipality: "Nasugbu",
      province: "Batangas",
      barangays: [...barangayRows.keys()].sort(),
    };

    return {
      period: {
        from: params.from,
        to: params.to,
        granularity,
        label: `${params.from} – ${params.to}`,
        timezone: "Asia/Manila",
        timezoneLabel: "PHT (UTC+8)",
        days,
        partial: false,
      },
      totalSubmitted: reports.length,
      series: [...series.entries()].map(([label, count]) => ({ label, count })),
      casesByBarangay: countBy(reports.map((report) => report.barangay))
        .map(([barangay, reportedCases]) => ({ barangay, reportedCases }))
        .sort((first, second) => second.reportedCases - first.reportedCases || first.barangay.localeCompare(second.barangay)),
      casesByPossibleCondition: countBy(reports.map((report) => report.predictedDisease))
        .map(([possibleCondition, reportedCases]) => ({ possibleCondition, reportedCases }))
        .sort((first, second) => second.reportedCases - first.reportedCases || first.possibleCondition.localeCompare(second.possibleCondition)),
      caseState,
      comparison: {
        previousFrom,
        previousTo,
        previousTotal: previousReports.length,
        currentTotal: reports.length,
        delta: reports.length - previousReports.length,
      },
      lifecycle: lifecycleCounts,
      area: {
        estimatedHectares: sumArea(areaReports),
        contributingReports: areaReports.length,
        measuredReports: measuredReports.length,
        measuredHectares: sumArea(measuredReports),
        notMeasuredReports: notMeasuredReports.length,
        notMeasuredHectares: sumArea(notMeasuredReports),
        linkedDuplicatesExcluded: reportsInRange.length - reports.length,
        overlapNote: "Estimates may overlap where submitted reports describe the same ground.",
      },
      validationWorkload: {
        assignees: [...workload.values()].sort((first, second) => first.name.localeCompare(second.name)),
        unassigned,
      },
      validationSchedule: { ...schedule, today },
      reviewBacklog: {
        totalWaiting: waitingReports.length,
        buckets: backlogBuckets.map(({ label, count }) => ({ label, count })),
        oldestWaitingDays: waitingDays.length > 0 ? Math.max(...waitingDays) : null,
      },
      reportedConcern,
      possibleCondition,
      verificationOutcome,
      validationByBarangay,
      barangayScope,
      validationTurnaround: {
        source: "activated_at_to_visited_at",
        completed: turnaroundHours.length,
        averageHours: turnaroundHours.length > 0
          ? Number((turnaroundHours.reduce((total, hours) => total + hours, 0) / turnaroundHours.length).toFixed(2))
          : null,
        medianHours: turnaroundMedian,
        minHours: turnaroundHours[0] ?? null,
        maxHours: turnaroundHours.at(-1) ?? null,
        buckets: turnaroundBuckets,
      },
    };
  }
}
