import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createAxiosClient } from "../../api/axiosClient";
import { paginatedReportsDto, reportDetailDto } from "../../test/fixtures";
import { server } from "../../test/server";
import { ApiReportsRepository } from "./ApiReportsRepository";

const baseUrl = "https://api.caneguard.test";

describe("ApiReportsRepository", () => {
  it("maps filters and Laravel pagination", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("page")).toBe("2");
        expect(query.get("per_page")).toBe("25");
        expect(query.get("search")).toBe("CG-2026");
        expect(query.get("status")).toBe("submitted_unverified");
        expect(query.get("predicted_label")).toBe("rust");
        expect(query.get("barangay")).toBe("Mabini");
        expect(query.get("date_from")).toBe("2026-07-01");
        expect(query.get("date_to")).toBe("2026-07-27");
        expect(query.get("sort")).toBe("-confidence");
        return HttpResponse.json(paginatedReportsDto);
      }),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    const result = await repository.listReports({
      page: 2,
      perPage: 25,
      search: " CG-2026 ",
      status: "submitted_unverified",
      disease: "rust",
      barangay: "Mabini",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-27",
      sort: "confidence_desc",
    });

    expect(result.meta.total).toBe(1);
    expect(result.reports[0].referenceCode).toBe("CG-2026-0001");
  });

  it("sends independent review decisions and correction reasons", async () => {
    server.use(
      http.patch(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/review`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            expected_version: reportDetailDto.version,
            notes: "Advisory recorded.",
            authority_classified_condition: "smut",
            verification_outcome: "verified",
            action_taken: "advisory_provided",
            case_state: "open",
            metadata_corrections: {
              barangay: "Poblacion",
              affected_area_hectares: 12.5,
            },
            correction_reason: "The field sheet was transcribed incorrectly.",
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              review: {
                ...reportDetailDto.review,
                action_taken: "advisory_provided",
              },
              lifecycle: {
                ...reportDetailDto.lifecycle,
                verification_outcome: "verified",
              },
            },
          });
        },
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(
      repository.updateReview(reportDetailDto.identity.uuid, {
        notes: " Advisory recorded. ",
        authorityClassifiedCondition: "smut",
        verificationOutcome: "verified",
        actionTaken: "advisory_provided",
        caseState: "open",
        metadataCorrections: {
          barangay: "Poblacion",
          affectedAreaHectares: 12.5,
        },
        correctionReason: " The field sheet was transcribed incorrectly. ",
        expectedVersion: reportDetailDto.version,
      }),
    ).resolves.toMatchObject({
      actionTaken: "advisory_provided",
      lifecycle: { verificationOutcome: "verified" },
    });
  });

  it("loads detail, writes legacy reviews, and treats 404 as missing", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}`, () =>
        HttpResponse.json({ data: reportDetailDto }),
      ),
      http.patch(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/review`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            status: "for_field_validation",
            notes: "Visit the field.",
            authority_classified_condition: null,
            expected_version: reportDetailDto.version,
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              review: {
                ...reportDetailDto.review,
                status: "for_field_validation",
                notes: "Visit the field.",
              },
            },
          });
        },
      ),
      http.get(`${baseUrl}/api/v1/reports/missing`, () =>
        HttpResponse.json(
          { message: "Not found.", code: "NOT_FOUND" },
          { status: 404 },
        ),
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(
      repository.getReportById(reportDetailDto.identity.uuid),
    ).resolves.toMatchObject({ referenceCode: "CG-2026-0001" });
    await expect(
      repository.updateReview(reportDetailDto.identity.uuid, {
        status: "for_field_validation",
        notes: " Visit the field. ",
        authorityClassifiedCondition: null,
        expectedVersion: reportDetailDto.version,
      }),
    ).resolves.toMatchObject({ reviewStatus: "for_field_validation" });
    await expect(repository.getReportById("missing")).resolves.toBeNull();
  });
});
