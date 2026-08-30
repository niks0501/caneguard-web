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
      http.get(`${baseUrl}/api/v1/dashboard/summary`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("month")).toBe("2026-07");
        return HttpResponse.json({
          data: {
            counts: {
              total_submitted: 5,
              submitted_unverified: 1,
              for_field_validation: 1,
              verified_by_staff: 1,
              unable_to_verify: 1,
              resolved: 1,
            },
            queues: {
              needs_review: 1,
              needs_visit: 2,
              follow_up_due: 1,
            },
            recent_reports: [reportListItemDto],
            monthly_summary: {
              month: "2026-07",
              period: { from: "2026-07-01", to: "2026-07-31" },
              reported_cases: 4,
              cases_by_barangay: [
                { barangay: "Mabini", reported_cases: 3 },
              ],
              cases_by_possible_condition: [
                { possible_condition: "rust", reported_cases: 2 },
              ],
              estimated_affected_hectares: 3.75,
              field_validation_counts: {
                unassigned: 1,
                assigned: 1,
                in_progress: 0,
                completed: 2,
                requiring_validation: 1,
              },
              closed_cases: 2,
              review_time: {
                source: "submitted_at_to_reviewed_at",
                reviewed_cases: 2,
                average_hours: 30,
                median_hours: 30,
                min_hours: 6,
                max_hours: 54,
              },
            },
          },
        });
      }),
    );
    const repository = new ApiDashboardRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(repository.getSummary("2026-07")).resolves.toMatchObject({
      totalSubmitted: 5,
      queues: { needs_review: 1, needs_visit: 2, follow_up_due: 1 },
      counts: { submitted_unverified: 1, resolved: 1 },
      recentReports: [{ referenceCode: "CG-2026-0001" }],
      monthlySummary: {
        month: "2026-07",
        reportedCases: 4,
        casesByBarangay: [{ barangay: "Mabini", reportedCases: 3 }],
        casesByPossibleCondition: [{ possibleCondition: "rust", reportedCases: 2 }],
        estimatedAffectedHectares: 3.75,
        fieldValidationCounts: { requiringValidation: 1 },
      },
    });
  });
});
