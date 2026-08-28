import type { QueryClient } from "@tanstack/react-query";
import { notificationsKeys } from "./notificationQueries";
import { fieldValidationKeys } from "./fieldValidationQueries";
import { reportKeys } from "./reportQueries";
import { dashboardKeys } from "./useDashboard";

export const realtimeEventName = ".case.submitted";

const defaultDomains = [
  "reports",
  "dashboard",
  "notifications",
] as const;

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
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
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
