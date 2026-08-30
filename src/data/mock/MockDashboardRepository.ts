import type {
  DashboardRepository,
} from "../contracts/DashboardRepository";
import type {
  DashboardSummary,
  MonthlyCaseSummary,
} from "../../domain/dashboard.types";
import type { DiseaseReport, ReviewStatus } from "../../domain/report.types";
import {
  legacyLifecycleForReviewStatus,
} from "../api/mappers/lifecycle.mapper";
import { mockReports } from "./mockReports";

function buildMonthlySummary(
  reports: DiseaseReport[],
  month: string,
): MonthlyCaseSummary {
  const monthlyReports = reports.filter((report) =>
    report.submittedAt.startsWith(month),
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
    const queues = {
      needs_review: 0,
      needs_visit: 0,
      follow_up_due: 0,
    };

    mockReports.forEach((report) => {
      counts[report.reviewStatus] += 1;
      if (report.reviewStatus === "submitted_unverified") {
        queues.needs_review += 1;
      }
      if (report.reviewStatus === "for_field_validation") {
        queues.needs_visit += 1;
      }
    });

    const selectedMonth = month ?? new Date().toISOString().slice(0, 7);

    return {
      totalSubmitted: mockReports.length,
      counts,
      queues,
      recentReports: mockReports.slice(0, 5),
      monthlySummary: buildMonthlySummary(mockReports, selectedMonth),
    };
  }
}
