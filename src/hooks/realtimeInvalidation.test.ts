import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { fieldValidationKeys } from "./fieldValidationQueries";
import {
  domainsFromRealtimePayload,
  invalidateRealtimeQueries,
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
});
