import { describe, expect, it } from "vitest";
import { paginatedReportsDto, reportDetailDto } from "../../../test/fixtures";
import { reportDetailResponseSchema } from "../schemas/report.schema";
import {
  mapPaginationMeta,
  mapReportDetail,
  mapReportListItem,
} from "./report.mapper";

describe("report mappers", () => {
  it("maps snake_case list fields into the domain model", () => {
    const report = mapReportListItem(paginatedReportsDto.data[0]);

    expect(report).toMatchObject({
      uuid: reportDetailDto.identity.uuid,
      referenceCode: "CG-2026-0001",
      submittedByName: "Ana Reporter",
      predictedDisease: "rust",
      province: "Negros Occidental",
      municipality: "Bago",
      observedAt: "2026-07-20T09:58:00.000Z",
      reviewStatus: "submitted_unverified",
    });
  });

  it("maps detail observations and review data", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
    );

    expect(report.capturedAt).toBe("2026-07-20T09:55:00.000Z");
    expect(report.observedAt).toBe("2026-07-20T09:58:00.000Z");
    expect(report.scanRecordClientUuid).toBe(
      reportDetailDto.identity.scan_record_client_uuid,
    );
    expect(report.symptoms[0]).toEqual({
      id: "orange_spots",
      label: "Orange Spots",
      answer: "yes",
    });
    expect(report.imageSourceType).toBe("camera");
    expect(report.classScores).toEqual(reportDetailDto.model.class_scores);
    expect(report.modelVersion).toBe("caneguard-v1");
    expect(report.processingTimingsMs?.total).toBe(30);
    expect(report.checklistConsistency).toBe("consistent");
    expect(report.farmerOrFarmOwnerName).toBe("Juan Dela Cruz");
    expect(report.province).toBe("Negros Occidental");
    expect(report.municipality).toBe("Bago");
    expect(report.finalLatitude).toBe(10.1234567);
    expect(report.finalLongitude).toBe(122.9876543);
    expect(report.locationSource).toBe("gps");
    expect(report.gpsAccuracy).toBe(4.25);
    expect(report.sugarcaneVariety).toBe("PSR 86");
    expect(report.cropAge).toBe("6 months");
    expect(report.caneClass).toBe("Class A");
    expect(report.affectedAreaHectares).toBe(12.5);
    expect(report.affectedPortionPercent).toBe(42.75);
    expect(report.fieldNotes).toContain("Rust symptoms");
    expect(report.updatedAt).toBe(reportDetailDto.updated_at);
    expect(report.reviewVersion).toBe(0);
  });

  it("maps Laravel pagination metadata", () => {
    expect(mapPaginationMeta(paginatedReportsDto.meta)).toEqual({
      currentPage: 1,
      from: 1,
      lastPage: 1,
      perPage: 15,
      to: 1,
      total: 1,
    });
  });
});
