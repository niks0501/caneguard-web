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
      reviewStatus: "submitted_unverified",
    });
  });

  it("maps detail observations and review data", () => {
    const report = mapReportDetail(
      reportDetailResponseSchema.parse({ data: reportDetailDto }).data,
    );

    expect(report.capturedAt).toBe("2026-07-20T09:55:00.000Z");
    expect(report.symptoms[0]).toEqual({
      id: "orange_spots",
      label: "Orange Spots",
      answer: "yes",
    });
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
