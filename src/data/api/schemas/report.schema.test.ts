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
      image: {
        ...reportDetailDto.image,
        source_width: null,
        source_height: null,
      },
      observations: {
        ...reportDetailDto.observations,
        reported_severity: null,
      },
    };

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
