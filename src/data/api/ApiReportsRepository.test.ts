import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createAxiosClient } from "../../api/axiosClient";
import {
  paginatedReportsDto,
  reportDetailDto,
  reportReferralDto,
} from "../../test/fixtures";
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

  it("sends field validation assignment input and maps the assignment snapshot", async () => {
    server.use(
      http.patch(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/review`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            field_validation_state: "assigned",
            field_validation_assignee_uuid: reportDetailDto.reporter.uuid,
            field_validation_target_date: null,
            expected_version: reportDetailDto.version,
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              lifecycle: { ...reportDetailDto.lifecycle, field_validation_state: "assigned" },
              field_validation_assignment: {
                uuid: "3fbd7f77-7d6b-4eb0-a1c7-b673f5a2f39f",
                assignee: reportDetailDto.reporter,
                assigned_by: { uuid: "a7c6e31a-e1d6-443f-a2f2-cf73541e7a0f", name: "Reviewer" },
                target_visit_date: null,
                activated_at: "2026-08-13T12:00:00.000Z",
                updated_at: "2026-08-13T12:00:00.000Z",
              },
            },
          });
        },
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(repository.updateReview(reportDetailDto.identity.uuid, {
      fieldValidationState: "assigned",
      fieldValidationAssigneeUuid: reportDetailDto.reporter.uuid,
      fieldValidationTargetDate: null,
      expectedVersion: reportDetailDto.version,
    })).resolves.toMatchObject({
      fieldValidationAssignment: {
        assignee: { uuid: reportDetailDto.reporter.uuid },
        targetVisitDate: undefined,
      },
      lifecycle: { fieldValidationState: "assigned" },
    });
  });

  it("records referrals and expert responses with their lifecycle fields", async () => {
    server.use(
      http.post(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/referral`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            destination: "Regional crop protection office",
            reference: "SRA-2026-0042",
            referral_date: "2026-09-04",
            note: "Please review the mismatch.",
            authority_classified_condition: "unable_to_classify",
            verification_outcome: "unable_to_verify",
            office_notes: "The office is awaiting expert input.",
            expected_version: reportDetailDto.version,
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              review: {
                ...reportDetailDto.review,
                action_taken: "referred_for_expert_validation",
              },
              lifecycle: {
                ...reportDetailDto.lifecycle,
                verification_outcome: "unable_to_verify",
                referral_state: "referred",
              },
              referral: reportReferralDto,
            },
          }, { status: 201 });
        },
      ),
      http.post(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/referral/response`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            response_date: "2026-09-08",
            response_note: "The specialist reviewed the image.",
            response_finding: "The finding is consistent with the office record.",
            authority_classified_condition: "smut",
            verification_outcome: "verified",
            expected_version: reportDetailDto.version + 1,
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              review: {
                ...reportDetailDto.review,
                authority_classified_condition: "smut",
                action_taken: "referred_for_expert_validation",
              },
              lifecycle: {
                ...reportDetailDto.lifecycle,
                verification_outcome: "verified",
                referral_state: "expert_response_received",
              },
              referral: {
                ...reportReferralDto,
                response_date: "2026-09-08",
                response_note: "The specialist reviewed the image.",
                response_finding: "The finding is consistent with the office record.",
                response_recorded_by: {
                  uuid: "a7c6e31a-e1d6-443f-a2f2-cf73541e7a0f",
                  name: "Maria Reviewer",
                },
                response_recorded_at: "2026-09-08T12:00:00.000Z",
              },
              version: reportDetailDto.version + 2,
            },
          });
        },
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(repository.recordReferral(reportDetailDto.identity.uuid, {
      destination: " Regional crop protection office ",
      reference: " SRA-2026-0042 ",
      referralDate: "2026-09-04",
      note: " Please review the mismatch. ",
      authorityClassifiedCondition: "unable_to_classify",
      verificationOutcome: "unable_to_verify",
      officeNotes: " The office is awaiting expert input. ",
      expectedVersion: reportDetailDto.version,
    })).resolves.toMatchObject({
      actionTaken: "referred_for_expert_validation",
      lifecycle: {
        verificationOutcome: "unable_to_verify",
        referralState: "referred",
      },
      referral: {
        reference: "SRA-2026-0042",
        officeContext: { notes: "The office is awaiting expert input." },
      },
    });

    await expect(repository.recordExpertReferralResponse(reportDetailDto.identity.uuid, {
      responseDate: "2026-09-08",
      responseNote: " The specialist reviewed the image. ",
      responseFinding: " The finding is consistent with the office record. ",
      authorityClassifiedCondition: "smut",
      verificationOutcome: "verified",
      expectedVersion: reportDetailDto.version + 1,
    })).resolves.toMatchObject({
      authorityClassifiedCondition: "smut",
      lifecycle: {
        verificationOutcome: "verified",
        referralState: "expert_response_received",
      },
      referral: {
        responseDate: "2026-09-08",
        responseFinding: "The finding is consistent with the office record.",
      },
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
