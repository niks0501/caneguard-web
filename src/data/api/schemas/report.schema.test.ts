import { describe, expect, it } from "vitest";
import { paginatedReportsDto, reportDetailDto } from "../../../test/fixtures";
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

  it("rejects an unknown backend disease label", () => {
    const invalid = {
      ...paginatedReportsDto,
      data: [{ ...paginatedReportsDto.data[0], predicted_label: "smut" }],
    };

    expect(() => reportListResponseSchema.parse(invalid)).toThrow();
  });
});
