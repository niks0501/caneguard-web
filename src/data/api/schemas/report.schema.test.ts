import { describe, expect, it } from "vitest";
import {
  activeAuthorityClassifiedConditions,
  legacyAuthorityClassifiedConditions,
} from "../../../domain/report.metadata";
import {
  paginatedReportsDto,
  reportDetailDto,
  reportReferralDto,
  staffClassifiedReportDetailDto,
} from "../../../test/fixtures";
import {
  reportDetailResponseSchema,
  reportListResponseSchema,
} from "./report.schema";

describe("report API schemas", () => {
  it("accepts the Laravel list and detail contracts", () => {
    expect(reportListResponseSchema.parse(paginatedReportsDto).data).toHaveLength(1);
    expect(
      reportDetailResponseSchema.parse({ data: reportDetailDto }).data.identity.uuid,
    ).toBe(reportDetailDto.identity.uuid);
  });

  it("accepts possible-match and canonical-linkage response fields", () => {
    const linked = {
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
      audit: {
        metadata_corrections: [],
        duplicate_linkages: [
          {
            id: 10,
            canonical_case_uuid: "canonical-report",
            actor: { uuid: "reviewer-1", name: "Maria Reviewer" },
            created_at: "2026-07-20T11:00:00.000Z",
            reason: "The cases may describe the same field observation.",
          },
        ],
      },
    };

    expect(
      reportDetailResponseSchema.parse({ data: linked }).data.duplicate_linkage
        ?.canonical_case?.reference_code,
    ).toBe("CG-2026-0002");
  });

  it("accepts nullable capture metadata from the database contract", () => {
    const nullableMetadata = {
      ...reportDetailDto,
      identity: {
        ...reportDetailDto.identity,
        scan_record_client_uuid: null,
      },
      timestamps: {
        ...reportDetailDto.timestamps,
        observed_at: null,
      },
      image: {
        ...reportDetailDto.image,
        source_width: null,
        source_height: null,
      },
      observations: {
        ...reportDetailDto.observations,
        reported_severity: null,
        farmer_or_farm_owner_name: null,
        province: null,
        municipality: null,
        final_latitude: null,
        final_longitude: null,
        location_source: null,
        gps_accuracy: null,
      },
      reporter_observation: {
        mismatch_reported: null,
        reporter_suspected_condition: null,
        reporter_observation_text: null,
      },
      review: {
        ...reportDetailDto.review,
        authority_classified_condition: null,
      },
    };

    expect(
      reportDetailResponseSchema.parse({ data: nullableMetadata }).data.identity
        .scan_record_client_uuid,
    ).toBeNull();
    expect(
      reportDetailResponseSchema.parse({ data: nullableMetadata }).data.timestamps
        .observed_at,
    ).toBeNull();

    expect(
      reportDetailResponseSchema.parse({ data: nullableMetadata }).data.image
        .source_width,
    ).toBeNull();
  });

  it("accepts an absent expert reference alongside the generated tracking code", () => {
    const response = reportDetailResponseSchema.parse({
      data: {
        ...reportDetailDto,
        referral: {
          ...reportReferralDto,
          reference: null,
          tracking_code: "CG-20260924-00000001",
        },
      },
    });

    expect(response.data.referral?.reference).toBeNull();
    expect(response.data.referral?.tracking_code).toBe("CG-20260924-00000001");
  });

  it("accepts the V2 smut model label", () => {
    const smut = {
      ...paginatedReportsDto,
      data: [{ ...paginatedReportsDto.data[0], predicted_label: "smut" }],
    };

    expect(reportListResponseSchema.parse(smut).data[0]?.predicted_label).toBe("smut");
  });

  it("rejects an unknown backend disease label", () => {
    const invalid = {
      ...paginatedReportsDto,
      data: [{ ...paginatedReportsDto.data[0], predicted_label: "downy_mildew" }],
    };

    expect(() => reportListResponseSchema.parse(invalid)).toThrow();
  });

  it("accepts every active and legacy authority classification value", () => {
    const values = [
      ...activeAuthorityClassifiedConditions,
      ...legacyAuthorityClassifiedConditions,
    ];

    for (const value of values) {
      const parsed = reportDetailResponseSchema.parse({
        data: {
          ...reportDetailDto,
          review: {
            ...reportDetailDto.review,
            authority_classified_condition: value,
          },
        },
      });

      expect(parsed.data.review.authority_classified_condition).toBe(value);
    }
  });

  it("keeps authority classifications separate from model labels", () => {
    const parsed = reportDetailResponseSchema.parse({
      data: {
        ...reportDetailDto,
        review: {
          ...reportDetailDto.review,
          authority_classified_condition: "rssi",
        },
      },
    });

    expect(parsed.data.model.predicted_label).toBe("rust");
    expect(parsed.data.review.authority_classified_condition).toBe("rssi");
    expect(
      reportDetailResponseSchema.parse({ data: staffClassifiedReportDetailDto }).data.review
        .authority_classified_condition,
    ).toBe("rssi");
  });
});
