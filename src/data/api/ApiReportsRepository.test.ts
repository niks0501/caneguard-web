import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/ApiError";
import { createAxiosClient } from "../../api/axiosClient";
import {
  paginatedReportsDto,
  reportDetailDto,
} from "../../test/fixtures";
import { server } from "../../test/server";
import { ApiReportsRepository } from "./ApiReportsRepository";

const baseUrl = "https://api.caneguard.test";

describe("ApiReportsRepository", () => {
  it("records only a versioned plain handoff note and maps saved records", async () => {
    const handoff = { id: 1, destination: "Offline validator", reference: null, sent_date: "2026-10-04", note: "Please advise", advice_received_note: null };
    server.use(http.post(`${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/handoff-notes`, async ({ request }) => {
      expect(await request.json()).toEqual({
        destination: handoff.destination, reference: null, sent_date: handoff.sent_date,
        note: handoff.note, advice_received_note: null, expected_version: reportDetailDto.version,
      });
      return HttpResponse.json({ data: { ...reportDetailDto, handoff_notes: [handoff], version: reportDetailDto.version + 1 } });
    }));
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));
    await expect(repository.recordHandoffNote(reportDetailDto.identity.uuid, {
      destination: " Offline validator ", reference: " ", sentDate: handoff.sent_date,
      note: " Please advise ", expectedVersion: reportDetailDto.version,
    })).resolves.toMatchObject({ handoffNotes: [handoff], reviewVersion: reportDetailDto.version + 1 });
  });

  it("maps filters and Laravel pagination", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("page")).toBe("2");
        expect(query.get("per_page")).toBe("25");
        expect(query.get("search")).toBe("CG-2026");
        expect(query.get("status")).toBe("submitted_unverified");
        expect(query.get("queue")).toBe("needs_review");
        expect(query.get("predicted_label")).toBe("rust");
        expect(query.get("barangay")).toBe("Mabini");
        expect(query.get("concern")).toBe("rssi");
        expect(query.get("date_from")).toBe("2026-07-01");
        expect(query.get("date_to")).toBe("2026-07-27");
        expect(query.get("sort")).toBe("submitted_at");
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
      queue: "needs_review",
      status: "submitted_unverified",
      disease: "rust",
      barangay: "Mabini",
      reportedConcern: "rssi",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-27",
      sort: "oldest",
    });

    expect(result.meta.total).toBe(1);
    expect(result.reports[0].referenceCode).toBe("CG-2026-0001");
  });


  it("reads an office case saved without an AI scan from the list and detail endpoints", async () => {
    const scanlessListItem = {
      ...paginatedReportsDto.data[0],
      predicted_label: null,
      image_url: null,
    };
    const scanlessDetail = {
      ...reportDetailDto,
      image: {
        url: null,
        mime_type: null,
        size_bytes: null,
        source_type: null,
        source_width: null,
        source_height: null,
      },
      model: {
        predicted_label: null,
        confidence: null,
        class_scores: [],
        model_version: null,
        model_version_recognised: null,
        timings_ms: { preprocess: null, inference: null, total: null },
      },
      observations: {
        ...reportDetailDto.observations,
        symptom_keys: [],
        checklist_consistency: null,
      },
    };
    server.use(
      http.get(`${baseUrl}/api/v1/reports`, () =>
        HttpResponse.json({
          ...paginatedReportsDto,
          data: [scanlessListItem],
        }),
      ),
      http.get(`${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}`, () =>
        HttpResponse.json({ data: scanlessDetail }),
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    const list = await repository.listReports();
    expect(list.reports[0].predictedDisease).toBeNull();
    expect(list.reports[0].imageStatus).toBe("unavailable");

    const detail = await repository.getReportById(reportDetailDto.identity.uuid);
    expect(detail).toMatchObject({
      predictedDisease: null,
      confidence: null,
      imageStatus: "unavailable",
      imageMimeType: null,
      imageSizeBytes: null,
      modelVersion: null,
      modelVersionRecognised: null,
      checklistConsistency: null,
    });
  });

  it("requests a filter-scoped CSV without pagination parameters", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports/export`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("page")).toBeNull();
        expect(query.get("per_page")).toBeNull();
        expect(query.get("queue")).toBe("needs_review");
        expect(query.get("search")).toBe("CG-2026");
        expect(query.get("status")).toBe("submitted_unverified");
        expect(query.get("predicted_label")).toBe("rust");
        expect(query.get("barangay")).toBe("Mabini");
        expect(query.get("date_from")).toBe("2026-07-01");
        expect(query.get("date_to")).toBe("2026-07-27");
        expect(query.get("sort")).toBe("-submitted_at");
        const csv = "case_reference,reported_cases\\nCG-2026-0001,1";
        return HttpResponse.arrayBuffer(new TextEncoder().encode(csv).buffer, {
          headers: { "Content-Type": "text/csv; charset=UTF-8" },
        });
      }),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    const result = await repository.exportReports({
      page: 3,
      perPage: 25,
      queue: "needs_review",
      search: " CG-2026 ",
      status: "submitted_unverified",
      disease: "rust",
      barangay: "Mabini",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-27",
      sort: "newest",
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toContain("text/csv");
    await expect(result.text()).resolves.toContain("CG-2026-0001");
  });

  it("maps explicit possible recent-match assistance", async () => {
    server.use(
      http.get(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/possible-matches`,
        () =>
          HttpResponse.json({
            data: [
              {
                case: {
                  uuid: "canonical-report",
                  reference_code: "CG-2026-0002",
                  submitted_at: "2026-07-20T10:00:00.000Z",
                  barangay: "Lumbangan",
                  farmer_or_farm_owner_name: "Roberto Mendoza",
                  submitted_by_name: "Elena Reyes",
                  workflow_status: "needs_review",
                  image_url: "/api/v1/reports/canonical-report/image",
                  image_status: "available",
                },
                match: {
                  condition: "rust",
                  distance_meters: 12.4,
                  basis: ["same_condition", "nearby_location", "recent_submission"],
                },
                message: "Possible recent match. Compare this case before deciding.",
              },
            ],
            message: "Possible recent matches found. Compare the submitted evidence before deciding.",
            meta: {
              possible_match: true,
              can_submit: true,
              assessment: "condition_and_location",
              recent_window_hours: 72,
              location_radius_meters: 100,
            },
          }),
      ),
    );
    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(
      repository.getPossibleRecentMatches(reportDetailDto.identity.uuid),
    ).resolves.toMatchObject({
      possibleMatch: true,
      canSubmit: true,
      matches: [{
        referenceCode: "CG-2026-0002",
        distanceMeters: 12.4,
        barangay: "Lumbangan",
        farmerOrFarmOwnerName: "Roberto Mendoza",
        submittedByName: "Elena Reyes",
        workflowStatus: "needs_review",
        imageStatus: "available",
      }],
    });
  });

  it("maps a candidate without a farmer name, reporter or photo", async () => {
    server.use(
      http.get(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/possible-matches`,
        () =>
          HttpResponse.json({
            data: [{
              case: {
                uuid: "candidate",
                reference_code: "CG-2026-0003",
                submitted_at: "2026-07-20T10:00:00.000Z",
                barangay: "Mabini",
                farmer_or_farm_owner_name: null,
                submitted_by_name: null,
                workflow_status: "resolved",
                image_url: null,
                image_status: "none",
              },
              match: { condition: "smut", distance_meters: 80, basis: ["same_condition"] },
              message: "Possible recent match. Compare this case before deciding.",
            }],
            message: "Possible recent matches found.",
            meta: {
              possible_match: true,
              can_submit: true,
              assessment: "condition_and_location",
              recent_window_hours: 72,
              location_radius_meters: 100,
            },
          }),
      ),
    );
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));

    const result = await repository.getPossibleRecentMatches(reportDetailDto.identity.uuid);

    expect(result.matches[0]).toMatchObject({
      farmerOrFarmOwnerName: null,
      submittedByName: null,
      workflowStatus: "resolved",
      imageUrl: null,
      imageStatus: "none",
    });
  });

  it("links a possible duplicate through the explicit canonical-link endpoint", async () => {
    server.use(
      http.post(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/duplicate-link`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            canonical_report_uuid: "canonical-report",
            reason: "The cases may describe the same field observation.",
            expected_version: reportDetailDto.version,
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              duplicate_linkage: {
                is_duplicate: true,
                canonical_case: {
                  uuid: "canonical-report",
                  reference_code: "CG-2026-0002",
                  submitted_at: "2026-07-20T10:00:00.000Z",
                },
                linked_by: { uuid: "reviewer-1", name: "Reviewer" },
                linked_at: "2026-07-20T11:00:00.000Z",
                reason: "The cases may describe the same field observation.",
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
      repository.linkDuplicate(reportDetailDto.identity.uuid, {
        canonicalReportUuid: "canonical-report",
        reason: " The cases may describe the same field observation. ",
        expectedVersion: reportDetailDto.version,
      }),
    ).resolves.toMatchObject({
      canonicalLinkage: {
        isDuplicate: true,
        canonicalCase: { referenceCode: "CG-2026-0002" },
        reason: "The cases may describe the same field observation.",
      },
    });
  });

  it("sends close_duplicate only when the reviewer also closes the duplicate case", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/duplicate-link`,
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              duplicate_linkage: {
                is_duplicate: true,
                canonical_case: {
                  uuid: "canonical-report",
                  reference_code: "CG-2026-0002",
                  submitted_at: "2026-07-20T10:00:00.000Z",
                },
                linked_by: { uuid: "reviewer-1", name: "Reviewer" },
                linked_at: "2026-07-20T11:00:00.000Z",
                reason: null,
                link_blocked_reason: "closed",
              },
            },
          });
        },
      ),
    );
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));
    const input = {
      canonicalReportUuid: "canonical-report",
      expectedVersion: reportDetailDto.version,
    };

    await repository.linkDuplicate(reportDetailDto.identity.uuid, { ...input, closeDuplicate: false });
    const closed = await repository.linkDuplicate(reportDetailDto.identity.uuid, { ...input, closeDuplicate: true });

    expect(bodies[0]).not.toHaveProperty("close_duplicate");
    expect(bodies[1]).toMatchObject({ close_duplicate: true });
    expect(closed.canonicalLinkage?.linkBlockedReason).toBe("closed");
  });

  it("maps why a duplicate link cannot change, including when the server omits it", async () => {
    const detail = (linkage: Record<string, unknown>) => HttpResponse.json({
      data: { ...reportDetailDto, duplicate_linkage: linkage },
    });
    const open = { is_duplicate: false, canonical_case: null, linked_by: null, linked_at: null, reason: null };
    const responses = [
      detail({ ...open, link_blocked_reason: "visit_completed" }),
      detail({ ...open, link_blocked_reason: null }),
      detail(open),
    ];
    server.use(
      http.post(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/duplicate-link`,
        () => responses.shift()!,
      ),
    );
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));
    const link = () => repository.linkDuplicate(reportDetailDto.identity.uuid, {
      canonicalReportUuid: "canonical-report",
      expectedVersion: reportDetailDto.version,
    });

    expect((await link()).canonicalLinkage?.linkBlockedReason).toBe("visit_completed");
    expect((await link()).canonicalLinkage?.linkBlockedReason).toBeNull();
    expect((await link()).canonicalLinkage?.linkBlockedReason).toBeUndefined();
  });

  it("saves affected field boundaries with device areas and office loss rates", async () => {
    const affectedField = {
      field_survey_id: 123,
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]],
      },
      captured_at: "2026-10-04T02:30:12.123456Z",
      area_sqm: 6075.12,
      area_source: "device_reported" as const,
      inspector: { uuid: "inspector-1", name: "Field Inspector" },
      affected_area_sqm: 1580,
      affected_percent: 26,
      loss_rate_percent: null,
    };
    server.use(http.put(
      `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/affected-fields`,
      async ({ request }) => {
        expect(await request.json()).toEqual({
          expected_version: reportDetailDto.version,
          affected_fields: [{ field_survey_id: 123 }],
        });
        return HttpResponse.json({
          data: {
            affected_fields: [affectedField],
            version: reportDetailDto.version + 1,
            updated_at: "2026-10-04T03:00:00.000Z",
          },
        });
      },
    ));
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));

    await expect(repository.updateAffectedFields(reportDetailDto.identity.uuid, {
      expectedVersion: reportDetailDto.version,
      affectedFields: [{ fieldSurveyId: 123 }],
    })).resolves.toMatchObject({
      affectedFields: [{
        fieldSurveyId: 123,
        areaSqm: 6075.12,
        areaSource: "device_reported",
        affectedAreaSqm: 1580,
        affectedPercent: 26,
        lossRatePercent: null,
      }],
      version: reportDetailDto.version + 1,
    });
  });

  it("unlinks a possible duplicate with the current report version", async () => {
    server.use(
      http.delete(
        `${baseUrl}/api/v1/reports/${reportDetailDto.identity.uuid}/duplicate-link`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            expected_version: reportDetailDto.version,
            reason: "The duplicate assessment was reversed.",
          });
          return HttpResponse.json({
            data: {
              ...reportDetailDto,
              version: reportDetailDto.version + 1,
              duplicate_linkage: {
                is_duplicate: false,
                canonical_case: null,
                linked_by: null,
                linked_at: null,
                reason: null,
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
      repository.unlinkDuplicate(reportDetailDto.identity.uuid, {
        expectedVersion: reportDetailDto.version,
        reason: " The duplicate assessment was reversed. ",
      }),
    ).resolves.toMatchObject({
      canonicalLinkage: {
        isDuplicate: false,
        canonicalCase: null,
      },
      reviewVersion: reportDetailDto.version + 1,
    });
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

  it("fetches and maps monthly report summary without retired expert metrics", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports/summary`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("month")).toBe("2026-07");
        return HttpResponse.json({
          data: {
            month: "2026-07",
            period: { from: "2026-07-01", to: "2026-07-31" },
            reported_cases: 3,
            cases_by_barangay: [],
            cases_by_possible_condition: [],
            estimated_affected_hectares: 3.75,
            field_validation_counts: {
              unassigned: 1,
              assigned: 1,
              in_progress: 0,
              completed: 1,
              requiring_validation: 1,
            },
            closed_cases: 1,
            review_time: {
              source: "submitted_at_to_reviewed_at",
              reviewed_cases: 2,
              average_hours: 15,
              median_hours: 15,
              min_hours: 6,
              max_hours: 24,
            },
          },
        });
      }),
    );

    const repository = new ApiReportsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    const summary = await repository.getMonthlySummary("2026-07");

    expect(summary.month).toBe("2026-07");
    expect(summary.reportedCases).toBe(3);
    expect(summary).not.toHaveProperty("expertVerification");
  });

  // Intent: the aerial photo goes up as multipart `image`, removal answers the removal identity and undo names it.
  it("uploads an aerial photo, removes a check and restores it", async () => {
    const id = reportDetailDto.identity.uuid;
    let received = "";
    let restoreBody: unknown = null;
    const dto = {
      uuid: "a1",
      image_url: `/api/v1/reports/${id}/aerial-analyses/a1/image`,
      mask_url: `/api/v1/reports/${id}/aerial-analyses/a1/mask`,
      image_width: 400,
      image_height: 300,
      mask_width: 400,
      mask_height: 300,
      enough_canopy: true,
      normal_canopy_percent: 82,
      abnormal_canopy_percent: 18,
      canopy_coverage_percent: 71,
      model_version: "aerial-v3",
      uploaded_by: { uuid: "u1", name: "Rey" },
      created_at: "2026-11-11T04:11:03.000000Z",
    };
    server.use(
      http.post(`${baseUrl}/api/v1/reports/${id}/aerial-analyses`, async ({ request }) => {
        expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
        received = await request.text();
        return HttpResponse.json({ data: dto }, { status: 201 });
      }),
      http.delete(
        `${baseUrl}/api/v1/reports/${id}/aerial-analyses/a1`,
        () => HttpResponse.json({ data: { removal_id: "rm-1" } }),
      ),
      http.post(`${baseUrl}/api/v1/reports/${id}/aerial-analyses/a1/restore`, async ({ request }) => {
        restoreBody = await request.json();
        return HttpResponse.json({ data: dto });
      }),
    );
    const repository = new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));

    const analysis = await repository.addAerialAnalysis(id, new File(["x"], "field.jpg", { type: "image/jpeg" }));

    expect(received).toContain('name="image"');
    expect(analysis).toMatchObject({ uuid: "a1", abnormalCanopyPercent: 18 });
    await expect(repository.removeAerialAnalysis(id, "a1")).resolves.toEqual({ removalId: "rm-1" });
    await expect(repository.restoreAerialAnalysis(id, "a1", "rm-1")).resolves.toMatchObject({
      uuid: "a1",
      abnormalCanopyPercent: 18,
    });
    expect(restoreBody).toEqual({ removal_id: "rm-1" });
  });

  describe("office advisory library", () => {
    const advisoryDto = {
      uuid: "5c21f90a-5a40-4d8d-ae35-1275bb3f0009", code: "ADV-RUST-001", title: "Manage rust", content: "Scout rows.",
      status: "validated", category: "rust", validation_provenance: null, validated_at: "2026-10-01T02:00:00.000Z",
    };
    const repository = () => new ApiReportsRepository(createAxiosClient({ apiBaseUrl: baseUrl }));

    it("lists advisories with their topic", async () => {
      server.use(http.get(`${baseUrl}/api/v1/advisories`, () => HttpResponse.json({ data: [advisoryDto, { ...advisoryDto, uuid: "x2", code: "ADV-OPS", category: null }] })));
      await expect(repository().listAdvisories()).resolves.toEqual([
        expect.objectContaining({ uuid: advisoryDto.uuid, category: "rust", validatedAt: advisoryDto.validated_at }),
        expect.objectContaining({ uuid: "x2", category: null }),
      ]);
    });

    it("creates with trimmed text and leaves a blank code for the server to generate", async () => {
      server.use(http.post(`${baseUrl}/api/v1/advisories`, async ({ request }) => {
        expect(await request.json()).toEqual({ title: "Manage rust", content: "Scout rows.", category: "rust" });
        return HttpResponse.json({ data: advisoryDto }, { status: 201 });
      }));
      await expect(repository().createAdvisory({ title: " Manage rust ", content: " Scout rows. ", category: "rust", code: "  " }))
        .resolves.toMatchObject({ uuid: advisoryDto.uuid, code: "ADV-RUST-001", category: "rust", status: "validated" });
    });

    it("sends a chosen code and surfaces field validation errors", async () => {
      server.use(http.post(`${baseUrl}/api/v1/advisories`, async ({ request }) => {
        expect(await request.json()).toMatchObject({ code: "ADV-RUST-001" });
        return HttpResponse.json({ message: "invalid", code: "VALIDATION_ERROR", errors: { code: ["That code is already used by another advisory."] } }, { status: 422 });
      }));
      const failure = await repository().createAdvisory({ title: "T", content: "C", code: "ADV-RUST-001" }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({ status: 422, errors: { code: ["That code is already used by another advisory."] } });
    });

    it("patches only the changed fields and can clear the topic", async () => {
      server.use(http.patch(`${baseUrl}/api/v1/advisories/${advisoryDto.uuid}`, async ({ request }) => {
        expect(await request.json()).toEqual({ title: "New title", category: null });
        return HttpResponse.json({ data: { ...advisoryDto, title: "New title", category: null } });
      }));
      await expect(repository().updateAdvisory(advisoryDto.uuid, { title: "New title", category: null }))
        .resolves.toMatchObject({ title: "New title", category: null });
    });

    it("explains a refused edit of a removed advisory through the status error", async () => {
      server.use(http.patch(`${baseUrl}/api/v1/advisories/${advisoryDto.uuid}`, () => HttpResponse.json(
        { message: "invalid", code: "VALIDATION_ERROR", errors: { status: ["This advisory was removed from the office library and can no longer be edited."] } },
        { status: 422 },
      )));
      await expect(repository().updateAdvisory(advisoryDto.uuid, { title: "x" }))
        .rejects.toMatchObject({ status: 422, errors: { status: [expect.stringContaining("removed from the office library")] } });
    });

    it.each(["hard", "archived"] as const)("reads a %s delete outcome", async (deleted) => {
      server.use(http.delete(`${baseUrl}/api/v1/advisories/${advisoryDto.uuid}`, () => HttpResponse.json({ data: { uuid: advisoryDto.uuid, deleted } })));
      await expect(repository().deleteAdvisory(advisoryDto.uuid)).resolves.toEqual({ uuid: advisoryDto.uuid, deleted });
    });

    it("reports a second delete of a removed advisory as not found", async () => {
      server.use(http.delete(`${baseUrl}/api/v1/advisories/${advisoryDto.uuid}`, () => HttpResponse.json({ message: "Not found." }, { status: 404 })));
      await expect(repository().deleteAdvisory(advisoryDto.uuid)).rejects.toMatchObject({ status: 404 });
    });
  });
});
