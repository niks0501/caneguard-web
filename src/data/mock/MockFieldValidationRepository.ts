import type {
  FieldValidationFilters,
  FieldValidationMapData,
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import type { DiseaseReport } from "../../domain/report.types";
import type { FieldValidationRepository } from "../contracts/FieldValidationRepository";
import { mockReports } from "./mockReports";

function matchesFilters(report: DiseaseReport, filters: FieldValidationFilters) {
  const observedDate = report.observedAt?.slice(0, 10);
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
    referenceCode: report.referenceCode,
    barangay: report.barangay,
    province: report.province ?? null,
    municipality: report.municipality ?? null,
    observedAt: report.observedAt ?? null,
    submittedAt: report.submittedAt,
    predictedDisease: report.predictedDisease,
    confidence: report.confidence,
    reviewStatus: report.reviewStatus,
    targetVisitDate: null,
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
    const reports = mockReports.filter(
      (report) =>
        (filters.status
          ? report.reviewStatus === filters.status
          : report.reviewStatus !== "resolved") &&
        (filters.queue === "needs_visit"
          ? report.reviewStatus === "for_field_validation"
          : filters.queue !== "follow_up_due") &&
        matchesFilters(report, filters),
    );
    const located = reports.filter(
      (report) =>
        report.finalLatitude !== undefined && report.finalLongitude !== undefined,
    );

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
          confidence: report.confidence,
          reviewStatus: report.reviewStatus,
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
      },
    };
  }

  async getQueue(filters: FieldValidationFilters = {}): Promise<FieldValidationQueueData> {
    const items = mockReports
      .filter(
        (report) =>
          report.reviewStatus === "for_field_validation" &&
          filters.queue !== "follow_up_due" &&
          matchesFilters(report, filters),
      )
      .sort((first, second) => {
        const firstObserved = first.observedAt
          ? Date.parse(first.observedAt)
          : Number.POSITIVE_INFINITY;
        const secondObserved = second.observedAt
          ? Date.parse(second.observedAt)
          : Number.POSITIVE_INFINITY;
        return (
          firstObserved - secondObserved ||
          Date.parse(first.submittedAt) - Date.parse(second.submittedAt) ||
          first.uuid.localeCompare(second.uuid)
        );
      })
      .map(toQueueItem);

    return {
      queue: filters.queue ?? "needs_visit",
      count: items.length,
      oldest: items[0] ?? null,
      items: items.slice(0, 50),
    };
  }
}
