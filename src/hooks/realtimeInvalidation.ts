import type { QueryClient } from "@tanstack/react-query";
import { notificationsKeys } from "./notificationQueries";
import { fieldValidationKeys } from "./fieldValidationQueries";
import { reportKeys } from "./reportQueries";
import { dashboardKeys } from "./useDashboard";

export const realtimeEventName = ".case.submitted";
export const realtimeAttentionEventName = ".case.attention_changed";

const defaultDomains = [
  "reports",
  "dashboard",
  "notifications",
] as const;

/** Every domain a missed signal could have touched; used to catch up after a gap. */
export const allRealtimeDomains = [
  ...defaultDomains,
  "field-validation",
] as const;

const reconnectBaseMs = 5_000;
const reconnectMaxMs = 60_000;

/** Delay before reconnect attempt `attempt` (0-based): 5s, 10s, 20s, 40s, then 60s. */
export function realtimeReconnectDelayMs(attempt: number) {
  return Math.min(reconnectBaseMs * 2 ** Math.max(0, attempt), reconnectMaxMs);
}

type RealtimePayload = {
  domains?: unknown;
};

export function invalidateRealtimeQueries(
  queryClient: QueryClient,
  domains: readonly string[] = defaultDomains,
) {
  const invalidations: Promise<void>[] = [];

  if (domains.includes("reports")) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    );
  }
  if (domains.includes("dashboard")) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    );
  }
  if (domains.includes("field-validation")) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: fieldValidationKeys.all }),
    );
  }
  if (domains.includes("notifications")) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: notificationsKeys.all }),
    );
  }

  return Promise.all(invalidations);
}

export function domainsFromRealtimePayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [...defaultDomains];

  const domains = (payload as RealtimePayload).domains;
  if (!Array.isArray(domains)) return [...defaultDomains];

  const supported = new Set([
    "reports",
    "dashboard",
    "field-validation",
    "notifications",
  ]);

  return domains.filter(
    (domain): domain is string =>
      typeof domain === "string" && supported.has(domain),
  );
}
