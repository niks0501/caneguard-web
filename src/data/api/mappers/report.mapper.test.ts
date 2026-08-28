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
      lifecycle: {
        caseState: "open",
        verificationOutcome: "not_determined",
        fieldValidationState: "unassigned",
        referralState: "not_referred",
      },
      mismatchReported: true,
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
    expect(report.mismatchReported).toBe(true);
    expect(report.reporterSuspectedCondition).toBe("smut");
    expect(report.reporterObservationText).toContain("Dark whip-like growths");
    expect(report.authorityClassifiedCondition).toBeNull();
    expect(report.actionTaken).toBeUndefined();
    expect(report.metadataCorrectionAudits).toEqual([]);
    expect(report.lifecycle).toEqual({
      caseState: "open",
      verificationOutcome: "not_determined",
      fieldValidationState: "unassigned",
      referralState: "not_referred",
    });
    expect(report.updatedAt).toBe(reportDetailDto.updated_at);
    expect(report.reviewVersion).toBe(0);
  });

  it("derives lifecycle dimensions when an older API omits them", () => {
    const legacyDetail = Object.fromEntries(
      Object.entries(reportDetailDto).filter(([key]) => key !== "lifecycle"),
    );
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({ data: legacyDetail }).data,
    );

    expect(report.lifecycle?.caseState).toBe("open");
    expect(report.lifecycle?.verificationOutcome).toBe("not_determined");
  });

  it("maps an audited metadata correction without changing submitted evidence", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          audit: {
            metadata_corrections: [
              {
                id: 4,
                field: "barangay",
                original_value: "Mabini",
                corrected_value: "Poblacion",
                actor: { uuid: "reviewer-1", name: "Maria Reviewer" },
                created_at: "2026-07-20T10:30:00.000Z",
                reason: "The location sheet had a transcription error.",
              },
            ],
          },
        },
      }).data,
    );

    expect(report.metadataCorrectionAudits).toEqual([
      {
        id: 4,
        field: "barangay",
        originalValue: "Mabini",
        correctedValue: "Poblacion",
        actorName: "Maria Reviewer",
        createdAt: "2026-07-20T10:30:00.000Z",
        reason: "The location sheet had a transcription error.",
      },
    ]);
    expect(report.predictedDisease).toBe("rust");
  });

  it("maps an authority classification without changing the model result", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          review: {
            ...reportDetailDto.review,
            authority_classified_condition: "smut",
          },
        },
      }).data,
    );

    expect(report.authorityClassifiedCondition).toBe("smut");
    expect(report.predictedDisease).toBe("rust");
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
