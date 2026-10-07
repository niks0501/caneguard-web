import type {
  FieldValidationFilters,
  FieldValidationMapData,
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import type { DiseaseReport } from "../../domain/report.types";
import type { FieldValidationRepository } from "../contracts/FieldValidationRepository";
import { manilaDateAt } from "../../domain/reportingTime";
import { legacyLifecycleForReviewStatus } from "../api/mappers/lifecycle.mapper";
import {
  filterMockOperationalQueue,
  isCanonicalWorkReport,
  isInOperationalQueue,
} from "./mockOperationalQueues";
import { mockReports } from "./mockReports";

function hasValidCoordinates(report: DiseaseReport) {
  const latitude = report.finalLatitude;
  const longitude = report.finalLongitude;
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function matchesFilters(report: DiseaseReport, filters: FieldValidationFilters) {
  const observedDate = report.observedAt
    ? manilaDateAt(new Date(report.observedAt))
    : undefined;
  return (
    (!filters.disease || report.predictedDisease === filters.disease) &&
    (!filters.barangay || report.barangay === filters.barangay) &&
    (!filters.dateFrom || (observedDate && observedDate >= filters.dateFrom)) &&
    (!filters.dateTo || (observedDate && observedDate <= filters.dateTo))
  );
}

function toQueueItem(report: DiseaseReport): FieldValidationQueueItem {
  return {
    uuid: report.uuid,
    reviewVersion: report.reviewVersion,
    referenceCode: report.referenceCode,
    barangay: report.barangay,
    province: report.province ?? null,
    municipality: report.municipality ?? null,
    observedAt: report.observedAt ?? null,
    submittedAt: report.submittedAt,
    predictedDisease: report.predictedDisease,
    confidence: report.confidence ?? 0,
    reviewStatus: report.reviewStatus,
    lifecycle: report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus),
    targetVisitDate: report.fieldValidationAssignment?.targetVisitDate ?? null,
    assignee: report.fieldValidationAssignment?.assignee ?? null,
    finalLatitude: report.finalLatitude ?? null,
    finalLongitude: report.finalLongitude ?? null,
    locationSource: report.locationSource ?? null,
    gpsAccuracy: report.gpsAccuracy ?? null,
    affectedAreaHectares: report.affectedAreaHectares ?? null,
    affectedPortionPercent: report.affectedPortionPercent ?? null,
  };
}

export class MockFieldValidationRepository implements FieldValidationRepository {
  async getMap(filters: FieldValidationFilters = {}): Promise<FieldValidationMapData> {
    const today = manilaDateAt();
    const reports = mockReports
      .filter(isCanonicalWorkReport)
      .filter(
        (report) =>
          (filters.status
            ? report.reviewStatus === filters.status
            : filters.queue !== undefined || report.reviewStatus !== "resolved") &&
          (!filters.queue || isInOperationalQueue(report, filters.queue, today)) &&
          matchesFilters(report, filters),
      );
    const located = reports.filter(hasValidCoordinates);
    const needVisitCount = reports.filter((report) =>
      isInOperationalQueue(report, "needs_visit", today),
    ).length;
    const overdueCount = reports.filter((report) =>
      isInOperationalQueue(report, "follow_up_due", today),
    ).length;

    return {
      type: "FeatureCollection",
      features: located.map((report) => ({
        type: "Feature",
        id: report.uuid,
        geometry: {
          type: "Point",
          coordinates: [report.finalLongitude!, report.finalLatitude!],
        },
        properties: {
          uuid: report.uuid,
          referenceCode: report.referenceCode,
          barangay: report.barangay,
          province: report.province ?? null,
          municipality: report.municipality ?? null,
          observedAt: report.observedAt ?? null,
          submittedAt: report.submittedAt,
          predictedDisease: report.predictedDisease,
          confidence: report.confidence ?? 0,
          reviewStatus: report.reviewStatus,
          lifecycle: report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus),
          locationSource: report.locationSource ?? null,
          gpsAccuracy: report.gpsAccuracy ?? null,
          affectedAreaHectares: report.affectedAreaHectares ?? null,
          affectedPortionPercent: report.affectedPortionPercent ?? null,
        },
      })),
      metadata: {
        totalCount: reports.length,
        locatedCount: located.length,
        unlocatedCount: reports.length - located.length,
        needVisitCount,
        overdueCount,
        limit: 1000,
        returnedCount: located.length,
        truncated: false,
      },
    };
  }

  async getQueue(filters: FieldValidationFilters = {}): Promise<FieldValidationQueueData> {
    const queue = filters.queue ?? "needs_visit";
    const today = manilaDateAt();
    const rawItems = filterMockOperationalQueue(mockReports, queue, today)
      .filter((report) => !filters.status || report.reviewStatus === filters.status)
      .filter((report) => matchesFilters(report, filters))
      .filter((report) => {
        const targetVisitDate = report.fieldValidationAssignment?.targetVisitDate;
        return (!filters.dueFrom || Boolean(targetVisitDate && targetVisitDate >= filters.dueFrom))
          && (!filters.dueTo || Boolean(targetVisitDate && targetVisitDate <= filters.dueTo));
      })
      .sort((first, second) => {
        if (queue === "follow_up_due" || queue === "upcoming") {
          const dueDifference = (first.fieldValidationAssignment?.targetVisitDate ?? "")
            .localeCompare(second.fieldValidationAssignment?.targetVisitDate ?? "");
          if (dueDifference !== 0) return dueDifference;
        }
        const firstObserved = first.observedAt
          ? Date.parse(first.observedAt)
          : Number.POSITIVE_INFINITY;
        const secondObserved = second.observedAt
          ? Date.parse(second.observedAt)
          : Number.POSITIVE_INFINITY;
        return firstObserved - secondObserved
          || Date.parse(first.submittedAt) - Date.parse(second.submittedAt)
          || first.uuid.localeCompare(second.uuid);
      })
      .map(toQueueItem)
      .filter((item) => {
        if (!filters.assignment || filters.assignment === "all") return true;
        if (filters.assignment === "unassigned") return !item.assignee;
        if (filters.assignment === "mine") {
          return item.assignee?.uuid === "00000000-0000-4000-8000-000000000100" || item.assignee?.name === "Maria Santos";
        }
        return true;
      });

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, filters.limit ?? 50);
    const startIndex = (page - 1) * limit;
    const paginatedItems = rawItems.slice(startIndex, startIndex + limit);

    return {
      queue,
      count: rawItems.length,
      total: rawItems.length,
      page,
      perPage: limit,
      oldest: rawItems[0] ?? null,
      items: paginatedItems,
    };
  }
}
