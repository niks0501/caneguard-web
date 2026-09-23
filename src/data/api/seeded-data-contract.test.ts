import { http, passthrough } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { analyticsResponseSchema } from "./schemas/analytics.schema";
import { dashboardResponseSchema } from "./schemas/dashboard.schema";
import {
  reportDetailResponseSchema,
  reportListResponseSchema,
} from "./schemas/report.schema";
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

it.skipIf(!token)("parses freshly seeded reports, dashboard, analytics, and monitoring API payloads", async () => {
  server.use(http.get(`${apiBaseUrl}/api/*`, () => passthrough()));

  const firstPage = parse(
    "reportListResponseSchema",
    reportListResponseSchema,
    await get("/api/v1/reports?page=1&per_page=100"),
  );
  const reports = [...firstPage.data];
  for (let page = 2; page <= firstPage.meta.last_page; page += 1) {
    const nextPage = parse(
      "reportListResponseSchema",
      reportListResponseSchema,
      await get(`/api/v1/reports?page=${page}&per_page=100`),
    );
    reports.push(...nextPage.data);
  }
  expect(reports.length > 0).toBe(import.meta.env.VITE_CG_EXPECT_SEEDED_RECORDS !== "false");

  if (reports[0]) {
    parse(
      "reportDetailResponseSchema",
      reportDetailResponseSchema,
      await get(`/api/v1/reports/${encodeURIComponent(reports[0].uuid)}`),
    );
  }
  parse(
    "dashboardResponseSchema",
    dashboardResponseSchema,
    await get("/api/v1/dashboard/summary"),
  );
  parse(
    "analyticsResponseSchema",
    analyticsResponseSchema,
    await get(
      "/api/v1/reports/analytics?from=2026-07-01&to=2026-12-30&granularity=week",
    ),
  );
  parse(
    "analyticsResponseSchema with filters",
    analyticsResponseSchema,
    await get(
      "/api/v1/reports/analytics?from=2026-07-01&to=2026-12-30&granularity=week&status=submitted_unverified",
    ),
  );
  parse(
    "monthlyReportSummaryResponseSchema",
    monthlyReportSummaryResponseSchema,
    await get("/api/v1/reports/summary?month=2026-09"),
  );
  parse(
    "mapResponseSchema",
    mapResponseSchema,
    await get("/api/v1/reports/map"),
  );
  parse(
    "fieldValidationQueueResponseSchema",
    fieldValidationQueueResponseSchema,
    await get("/api/v1/reports/field-validation-queue?limit=50"),
  );
});
