import type { FieldSurveyBoundaryFeature, FieldSurveyCaseLink } from "../../domain/fieldSurvey.types";
import type { MeasurementProvenance } from "../../domain/report.types";

/**
 * Where a field map stands with the office:
 * `confirmed` — a case links it as its field; `waiting` — an inspector attached
 * it to a case but no one confirmed it yet; `unlinked` — no case uses it.
 */
export type FieldMapStatus = "confirmed" | "waiting" | "unlinked";

export const FIELD_MAP_STATUS_LABEL: Record<FieldMapStatus, string> = {
  confirmed: "Confirmed",
  waiting: "Waiting for office",
  unlinked: "Not on a case",
};

export type FieldMapPeriod = "all" | "7" | "30" | "90";

export const FIELD_MAP_PERIOD_LABEL: Record<FieldMapPeriod, string> = {
  all: "All time",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
};

export interface FieldMapFilters {
  /** Inspector uuid, or "all". */
  inspector: string;
  status: FieldMapStatus | "all";
  period: FieldMapPeriod;
}

export const NO_FIELD_MAP_FILTERS: FieldMapFilters = { inspector: "all", status: "all", period: "all" };

export function fieldMapStatus(feature: FieldSurveyBoundaryFeature): FieldMapStatus {
  const { cases } = feature.properties;
  if (cases.some((link) => link.link === "confirmed")) return "confirmed";
  return cases.length > 0 ? "waiting" : "unlinked";
}

/** The case a map is shown against: the confirmed one first, else the first attached. */
export function primaryCase(feature: FieldSurveyBoundaryFeature): FieldSurveyCaseLink | null {
  const { cases } = feature.properties;
  return cases.find((link) => link.link === "confirmed") ?? cases[0] ?? null;
}

/**
 * Whether a field map's affected ground area was actually measured.
 * Explicit `affectedAreaMeasurement` wins; legacy payloads omitting it treat
 * `null` or `0` as unmeasured (matching FieldSurvey::affectedAreaMeasurement).
 */
export function isAffectedAreaMeasured(
  affectedAreaSqm: number | null | undefined,
  affectedAreaMeasurement?: MeasurementProvenance | null,
): boolean {
  if (affectedAreaMeasurement === "not_measured") return false;
  if (typeof affectedAreaSqm !== "number" || !Number.isFinite(affectedAreaSqm)) return false;
  if (affectedAreaMeasurement === "measured") return true;
  return affectedAreaSqm > 0;
}

/**
 * Same rule as the API: the share of the plot that was measured as affected, or
 * null unless `affectedAreaMeasurement === 'measured'` (with legacy fallback
 * treating positive-only payloads without provenance as measured and 0 as
 * unmeasured).
 */
export function percentAffected(
  areaSqm: number,
  affectedAreaSqm: number | null,
  affectedAreaMeasurement?: MeasurementProvenance | null,
): number | null {
  if (!isAffectedAreaMeasured(affectedAreaSqm, affectedAreaMeasurement)) return null;
  if (affectedAreaSqm === null || areaSqm <= 0) return null;
  return Math.round(Math.min(100, (affectedAreaSqm / areaSqm) * 100) * 10) / 10;
}

/** What people recognise: the name the inspector typed, else the case reference, else "Map N". */
export function fieldMapName(feature: FieldSurveyBoundaryFeature): string {
  return feature.properties.label || primaryCase(feature)?.referenceCode || `Map ${feature.properties.id}`;
}

export function filterFieldMaps(
  features: FieldSurveyBoundaryFeature[],
  filters: FieldMapFilters,
  now: number,
): FieldSurveyBoundaryFeature[] {
  const cutoff = filters.period === "all" ? null : now - Number(filters.period) * 86_400_000;
  return features.filter((feature) => {
    if (filters.inspector !== "all" && feature.properties.inspector.uuid !== filters.inspector) return false;
    if (filters.status !== "all" && fieldMapStatus(feature) !== filters.status) return false;
    if (cutoff !== null && Date.parse(feature.properties.capturedAt) < cutoff) return false;
    return true;
  });
}

export function fieldMapFiltersActive(filters: FieldMapFilters): boolean {
  return filters.inspector !== "all" || filters.status !== "all" || filters.period !== "all";
}

/** Inspectors present in the loaded maps, by name. */
export function fieldMapInspectors(features: FieldSurveyBoundaryFeature[]): Array<{ uuid: string; name: string }> {
  const seen = new Map<string, string>();
  for (const feature of features) seen.set(feature.properties.inspector.uuid, feature.properties.inspector.name);
  return [...seen.entries()]
    .map(([uuid, name]) => ({ uuid, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
