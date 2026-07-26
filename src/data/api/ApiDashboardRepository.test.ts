import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createAxiosClient } from "../../api/axiosClient";
import { reportListItemDto } from "../../test/fixtures";
import { server } from "../../test/server";
import { ApiDashboardRepository } from "./ApiDashboardRepository";

describe("ApiDashboardRepository", () => {
  it("validates and maps the Laravel summary contract", async () => {
    const baseUrl = "https://api.caneguard.test";
    server.use(
      http.get(`${baseUrl}/api/v1/dashboard/summary`, () =>
        HttpResponse.json({
          data: {
            counts: {
              total_submitted: 5,
              submitted_unverified: 1,
              for_field_validation: 1,
              verified_by_staff: 1,
              unable_to_verify: 1,
              resolved: 1,
            },
            recent_reports: [reportListItemDto],
          },
        }),
      ),
    );
    const repository = new ApiDashboardRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(repository.getSummary()).resolves.toMatchObject({
      totalSubmitted: 5,
      counts: { submitted_unverified: 1, resolved: 1 },
      recentReports: [{ referenceCode: "CG-2026-0001" }],
    });
  });
});
