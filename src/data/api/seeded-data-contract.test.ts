import { http, passthrough } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { analyticsResponseSchema } from "./schemas/analytics.schema";
import { dashboardResponseSchema } from "./schemas/dashboard.schema";
import { reportListResponseSchema } from "./schemas/report.schema";
import { monthlyReportSummaryResponseSchema } from "./schemas/reporting.schema";
import {
  fieldValidationQueueResponseSchema,
  mapResponseSchema,
} from "./schemas/fieldValidation.schema";

// Run with a freshly seeded local API and VITE_CG_SEED_TEST_TOKEN set. The
// default web suite skips this service-backed check when no token is supplied.
const apiBaseUrl =
  import.meta.env.VITE_CG_LOCAL_API_URL ?? "http://127.0.0.1:8000";
const token = import.meta.env.VITE_CG_SEED_TEST_TOKEN;

async function get(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, apiBaseUrl), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

type ContractSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: Array<{ path: PropertyKey[]; message: string }> };
      };
};

function parse<T>(name: string, schema: ContractSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    throw new Error(`${name} rejected API payload: ${JSON.stringify(issues)}`);
  }
  return result.data;
}

it.skipIf(!token)("validates empty payloads from the freshly seeded demo-account API", async () => {
  server.use(http.get(`${apiBaseUrl}/api/*`, () => passthrough()));

  const firstPage = parse(
    "reportListResponseSchema",
    reportListResponseSchema,
    await get("/api/v1/reports?page=1&per_page=100"),
  );
  expect(firstPage.data).toEqual([]);
  expect(firstPage.meta.total).toBe(0);

  const dashboard = parse(
    "dashboardResponseSchema",
    dashboardResponseSchema,
    await get("/api/v1/dashboard/summary?month=2026-09"),
  );
  expect(Object.values(dashboard.data.counts).every((count) => count === 0)).toBe(true);
  expect(
    dashboard.data.queues &&
      Object.values(dashboard.data.queues).every((count) => count === 0),
  ).toBe(true);
  expect(dashboard.data.recent_reports).toEqual([]);
  expect(dashboard.data.monthly_summary?.reported_cases).toBe(0);
  expect(dashboard.data.monthly_summary?.cases_by_barangay).toEqual([]);
  expect(dashboard.data.monthly_summary?.cases_by_possible_condition).toEqual([]);

  const analytics = parse(
    "analyticsResponseSchema",
    analyticsResponseSchema,
    await get(
      "/api/v1/reports/analytics?from=2026-07-01&to=2026-12-30&granularity=week",
    ),
  );
  expect(analytics.data.total_submitted).toBe(0);
  expect(analytics.data.series.every((point) => point.count === 0)).toBe(true);
  expect(analytics.data.cases_by_barangay).toEqual([]);
  expect(analytics.data.cases_by_possible_condition).toEqual([]);
  expect(analytics.data.case_state).toEqual({ open: 0, closed: 0 });
  parse(
    "analyticsResponseSchema with filters",
    analyticsResponseSchema,
    await get(
      "/api/v1/reports/analytics?from=2026-07-01&to=2026-12-30&granularity=week&status=submitted_unverified",
    ),
  );

  const monthlySummary = parse(
    "monthlyReportSummaryResponseSchema",
    monthlyReportSummaryResponseSchema,
    await get("/api/v1/reports/summary?month=2026-09"),
  );
  expect(monthlySummary.data.reported_cases).toBe(0);
  expect(monthlySummary.data.cases_by_barangay).toEqual([]);
  expect(monthlySummary.data.cases_by_possible_condition).toEqual([]);

  const map = parse(
    "mapResponseSchema",
    mapResponseSchema,
    await get("/api/v1/reports/map"),
  );
  expect(map.features).toEqual([]);
  expect(map.metadata.total_count).toBe(0);
  expect(map.metadata.located_count).toBe(0);
  expect(map.metadata.unlocated_count).toBe(0);
  const validationQueue = parse(
    "fieldValidationQueueResponseSchema",
    fieldValidationQueueResponseSchema,
    await get("/api/v1/reports/field-validation-queue?limit=50"),
  );
  expect(validationQueue.data.count).toBe(0);
  expect(validationQueue.data.items).toEqual([]);
  expect(validationQueue.data.oldest).toBeNull();

  const documentResponse = await fetch(new URL(
    "/api/v1/reports/documents/report?period_type=monthly&month=2026-09",
    apiBaseUrl,
  ), {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/html" },
  });
  if (!documentResponse.ok) {
    throw new Error(`/api/v1/reports/documents/report returned HTTP ${documentResponse.status}`);
  }
  const document = await documentResponse.text();
  expect(document).toContain("No submitted reports in this period.");
  expect(document).toContain("<span class=\"metric-value\">0</span>");
});
