import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { fieldValidationKeys } from "./fieldValidationQueries";
import {
  domainsFromRealtimePayload,
  invalidateRealtimeQueries,
  realtimeReconnectDelayMs,
} from "./realtimeInvalidation";
import { reportKeys } from "./reportQueries";
import { dashboardKeys } from "./useDashboard";
import { notificationsKeys } from "./notificationQueries";

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("real-time invalidation", () => {
  it("invalidates map and queue queries after a new submission signal", async () => {
    const client = queryClient();
    client.setQueryData(fieldValidationKeys.map({}), { features: [] });
    client.setQueryData(fieldValidationKeys.queue({}), { items: [] });
    const domains = domainsFromRealtimePayload({ domains: ["reports", "dashboard", "field-validation", "notifications"] });
    await invalidateRealtimeQueries(client, domains);
    expect(client.getQueryState(fieldValidationKeys.map({}))?.isInvalidated).toBe(true);
    expect(client.getQueryState(fieldValidationKeys.queue({}))?.isInvalidated).toBe(true);
  });

  it("invalidates only the REST query domains named by the signal", async () => {
    const client = queryClient();
    client.setQueryData(reportKeys.list({}), { reports: [] });
    client.setQueryData(dashboardKeys.summary(), { totalSubmitted: 0 });
    client.setQueryData(notificationsKeys.feed(), { notifications: [] });
    client.setQueryData(fieldValidationKeys.queue({}), { items: [] });

    await invalidateRealtimeQueries(client, ["reports", "notifications"]);

    expect(client.getQueryState(reportKeys.list({}))?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(notificationsKeys.feed())?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(dashboardKeys.summary())?.isInvalidated).toBe(
      false,
    );
    expect(
      client.getQueryState(fieldValidationKeys.queue({}))?.isInvalidated,
    ).toBe(false);
  });

  it("refreshes the dashboard query that owns operational queue counts", async () => {
    const client = queryClient();
    client.setQueryData(dashboardKeys.summary(), {
      queues: { needs_review: 1, needs_visit: 0, follow_up_due: 0 },
    });

    await invalidateRealtimeQueries(client, ["dashboard"]);

    expect(client.getQueryState(dashboardKeys.summary())?.isInvalidated).toBe(true);
  });

  it("invalidates filtered field-validation queues for operational signals", async () => {
    const client = queryClient();
    client.setQueryData(fieldValidationKeys.queue({ queue: "follow_up_due" }), {
      count: 1,
      items: [],
    });

    await invalidateRealtimeQueries(client, ["field-validation"]);

    expect(
      client.getQueryState(fieldValidationKeys.queue({ queue: "follow_up_due" }))?.isInvalidated,
    ).toBe(true);
  });

  it("falls back to the operational domains for an incomplete signal", () => {
    expect(domainsFromRealtimePayload({})).toEqual([
      "reports",
      "dashboard",
      "notifications",
    ]);
    expect(domainsFromRealtimePayload({ domains: ["unknown", 1] })).toEqual(
      [],
    );
  });

  it("refreshes open report details and summaries on a reports signal", async () => {
    const client = queryClient();
    client.setQueryData(reportKeys.detail("case-1"), { id: "case-1" });
    client.setQueryData(reportKeys.possibleMatches("case-1"), []);
    client.setQueryData(reportKeys.summary(), { total: 0 });

    await invalidateRealtimeQueries(client, ["reports"]);

    expect(client.getQueryState(reportKeys.detail("case-1"))?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(reportKeys.possibleMatches("case-1"))?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(reportKeys.summary())?.isInvalidated).toBe(true);
  });

  it("doubles the reconnect delay from 5s up to a 60s cap", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(realtimeReconnectDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ]);
  });
});
