import {
  NO_FIELD_MAP_FILTERS,
  type FieldMapFilters,
  type FieldMapPeriod,
  type FieldMapStatus,
} from "./fieldMapStatus";

export const FIELD_MAP_URL_KEYS = ["fm_inspector", "fm_status", "fm_period"] as const;

const STATUSES: readonly FieldMapStatus[] = ["confirmed", "waiting", "unlinked"];
const PERIODS: readonly FieldMapPeriod[] = ["7", "30", "90"];

export function parseFieldMapFilters(searchParams: URLSearchParams): FieldMapFilters {
  const inspector = searchParams.get("fm_inspector")?.trim();
  const status = searchParams.get("fm_status");
  const period = searchParams.get("fm_period");
  return {
    inspector: inspector || NO_FIELD_MAP_FILTERS.inspector,
    status: STATUSES.find((value) => value === status) ?? NO_FIELD_MAP_FILTERS.status,
    period: PERIODS.find((value) => value === period) ?? NO_FIELD_MAP_FILTERS.period,
  };
}

export function writeFieldMapFilters(current: URLSearchParams, filters: FieldMapFilters): URLSearchParams {
  const next = new URLSearchParams(current);
  const values = { fm_inspector: filters.inspector, fm_status: filters.status, fm_period: filters.period };
  for (const key of FIELD_MAP_URL_KEYS) {
    if (values[key] === "all") next.delete(key);
    else next.set(key, values[key]);
  }
  return next;
}
