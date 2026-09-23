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
const validateDemoAnalytics =
  import.meta.env.VITE_CG_SEED_DEMO_ANALYTICS === "true";

function monthInManila(monthsBack = 0): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const absoluteMonth = year * 12 + month - 1 - monthsBack;
  const resultYear = Math.floor(absoluteMonth / 12);
  const resultMonth = absoluteMonth % 12 + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, "0")}`;
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

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

it.skipIf(!token || validateDemoAnalytics)("validates empty payloads from the freshly seeded demo-account API", async () => {
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

it.skipIf(!token || !validateDemoAnalytics)("validates the opt-in demo analytics payloads against client schemas", async () => {
  server.use(http.get(`${apiBaseUrl}/api/*`, () => passthrough()));

  const currentMonth = monthInManila();
  const from = `${monthInManila(4)}-01`;
  const to = monthEnd(currentMonth);

  const reports = parse(
    "reportListResponseSchema",
    reportListResponseSchema,
    await get("/api/v1/reports?page=1&per_page=100"),
  );
  expect(reports.data).toHaveLength(50);
  expect(reports.meta.total).toBe(50);

  const dashboard = parse(
    "dashboardResponseSchema",
    dashboardResponseSchema,
    await get(`/api/v1/dashboard/summary?month=${currentMonth}`),
  );
  expect(dashboard.data.counts.total_submitted).toBe(50);
  expect(dashboard.data.monthly_summary?.reported_cases).toBe(10);
  expect(Object.values(dashboard.data.queues ?? {}).every((count) => count > 0)).toBe(true);

  const analytics = parse(
    "analyticsResponseSchema",
    analyticsResponseSchema,
    await get(`/api/v1/reports/analytics?from=${from}&to=${to}&granularity=week`),
  );
  expect(analytics.data.total_submitted).toBe(50);
  expect(analytics.data.cases_by_barangay).toHaveLength(12);
  expect(analytics.data.cases_by_possible_condition).toHaveLength(4);

  const filteredAnalytics = parse(
    "analyticsResponseSchema with filter record",
    analyticsResponseSchema,
    await get(
      `/api/v1/reports/analytics?from=${from}&to=${to}&granularity=week&status=for_field_validation&follow_up_outcome=improved`,
    ),
  );
  expect(filteredAnalytics.data.total_submitted).toBe(2);
  expect(filteredAnalytics.data.filters).toMatchObject({
    status: "for_field_validation",
    follow_up_outcome: "improved",
  });

  const monthlySummary = parse(
    "monthlyReportSummaryResponseSchema",
    monthlyReportSummaryResponseSchema,
    await get(`/api/v1/reports/summary?month=${currentMonth}`),
  );
  expect(monthlySummary.data.reported_cases).toBe(10);

  const map = parse(
    "mapResponseSchema",
    mapResponseSchema,
    await get("/api/v1/reports/map?status=submitted_unverified"),
  );
  expect(map.metadata.total_count).toBe(10);
  expect(map.metadata.located_count).toBe(9);
  expect(map.metadata.unlocated_count).toBe(1);

  for (const [queue, count] of [
    ["needs_visit", 5],
    ["follow_up_due", 4],
    ["upcoming", 1],
  ] as const) {
    const response = parse(
      `fieldValidationQueueResponseSchema (${queue})`,
      fieldValidationQueueResponseSchema,
      await get(`/api/v1/reports/field-validation-queue?queue=${queue}&limit=50`),
    );
    expect(response.data.count).toBe(count);
    expect(response.data.items).toHaveLength(count);
  }

  const advisoryCase = reports.data.find(
    (report) => report.action_taken === "advisory_provided",
  );
  expect(advisoryCase).toBeDefined();
  const detail = parse(
    "reportDetailResponseSchema",
    reportDetailResponseSchema,
    await get(`/api/v1/reports/${advisoryCase!.uuid}`),
  );
  expect(detail.data.identity.uuid).toBe(advisoryCase!.uuid);
  expect(detail.data.model.class_scores).toHaveLength(4);
  expect(detail.data.advisory?.status).toBe("validated");

  const documentResponse = await fetch(new URL(
    `/api/v1/reports/documents/report?period_type=custom&from=${from}&to=${to}&appendix=1`,
    apiBaseUrl,
  ), {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/html" },
  });
  if (!documentResponse.ok) {
    throw new Error(`/api/v1/reports/documents/report returned HTTP ${documentResponse.status}`);
  }
  const document = await documentResponse.text();
  expect(document).toContain("<span class=\"metric-value\">50</span>");
  expect([...document.matchAll(/BGO-DEMO50-/g)]).toHaveLength(50);
});
