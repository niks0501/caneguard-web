import { describe, expect, it } from "vitest";
import {
  completedFieldValidationAssignmentDto,
  paginatedReportsDto,
  reportDetailDto,
  reportReferralDto,
  staffClassifiedReportDetailDto,
} from "../../../test/fixtures";
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
    expect(report.confidence).toBeUndefined();
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
    expect(report.affectedAreaMeasurement).toBe("measured");
    expect(report.affectedPortionPercent).toBe(42.75);
    expect(report.affectedPortionMeasurement).toBe("measured");
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

  it("preserves RSSI as reporter observation evidence while keeping the model result unchanged", () => {
    const rssi = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          model: {
            ...reportDetailDto.model,
            predicted_label: "rust",
          },
          reporter_observation: {
            mismatch_reported: true,
            reporter_suspected_condition: "RSSI",
            reporter_observation_text: "RSSI concern observed in the field.",
          },
        },
      }).data,
    );

    expect(rssi.reporterSuspectedCondition).toBe("RSSI");
    expect(rssi.reporterObservationText).toBe("RSSI concern observed in the field.");
    expect(rssi.mismatchReported).toBe(true);
    expect(rssi.predictedDisease).toBe("rust");
    expect(rssi.classScores).toEqual(reportDetailDto.model.class_scores);
  });

  it("maps completed field validation evidence into the review model", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          lifecycle: {
            ...reportDetailDto.lifecycle,
            field_validation_state: "completed",
          },
          field_validation_assignment: completedFieldValidationAssignmentDto,
        },
      }).data,
    );

    expect(report.fieldValidationAssignment?.completion).toEqual({
      fieldObservation:
        "Fresh observation from the assigned validation visit.",
      fieldFinding: "The field finding is preserved as separate evidence.",
      actionTaken: "Provided field guidance and recorded the next action.",
    });
  });

  it("maps the referral lifecycle and preserves the office snapshot", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          referral: reportReferralDto,
          lifecycle: { ...reportDetailDto.lifecycle, referral_state: "referred" },
        },
      }).data,
    );

    expect(report.referral).toMatchObject({
      destination: "Regional crop protection office",
      reference: "SRA-2026-0042",
      referralDate: "2026-09-04",
      note: "Please review the mismatch.",
      officeContext: {
        caseState: "open",
        verificationOutcome: "not_determined",
        actionTaken: "referred_for_expert_validation",
        notes: "The office is awaiting expert input.",
        reviewer: { name: "Maria Reviewer" },
      },
    });
    expect(report.lifecycle?.referralState).toBe("referred");
  });

  it("maps canonical linkage without changing submitted model evidence", () => {
    const linked = mapReportDetail(
      reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          duplicate_linkage: {
            is_duplicate: true,
            canonical_case: {
              uuid: "canonical-report",
              reference_code: "CG-2026-0002",
              submitted_at: "2026-07-20T10:00:00.000Z",
            },
            linked_by: { uuid: "reviewer-1", name: "Maria Reviewer" },
            linked_at: "2026-07-20T11:00:00.000Z",
            reason: "The cases may describe the same field observation.",
          },
        },
      }).data,
    );

    expect(linked.canonicalLinkage).toEqual({
      isDuplicate: true,
      canonicalCase: {
        uuid: "canonical-report",
        referenceCode: "CG-2026-0002",
        submittedAt: "2026-07-20T10:00:00.000Z",
      },
      linkedBy: { uuid: "reviewer-1", name: "Maria Reviewer" },
      linkedAt: "2026-07-20T11:00:00.000Z",
      reason: "The cases may describe the same field observation.",
    });
    expect(linked.predictedDisease).toBe("rust");
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
      reportDetailResponseSchema.parse({ data: staffClassifiedReportDetailDto }).data,
    );

    expect(report.authorityClassifiedCondition).toBe("rssi");
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
