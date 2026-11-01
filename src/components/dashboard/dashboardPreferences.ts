import { z } from "zod";
import { manilaDateAt } from "../../domain/reportingTime";
import type { ScopeSelection } from "./dashboardScope";

/**
 * Dashboard control memory (overhaul §3.1, §3.4, decision Q1).
 *
 * Every persisted Overview control lives here: the scope ruler (mode, month,
 * custom window) and the map layer toggle. The captain chooses them once, and
 * leaving for another page or reloading the tab brings the same view back.
 *
 * The stored payload is versioned, so a later control set migrates instead of
 * discarding a captain's choices, and every read is validated: a truncated,
 * hand-edited or outdated value falls back to the current defaults rather than
 * breaking the page.
 */

export const DASHBOARD_PREFERENCES_STORAGE_KEY =
  "caneguard.dashboard.preferences";
export const DASHBOARD_PREFERENCES_VERSION = 1;

export type MapLayer = "barangay" | "gps";

export const mapLayerValues = ["barangay", "gps"] as const;

export interface DashboardPreferences {
  selection: ScopeSelection;
  mapLayer: MapLayer;
}

const scopeModeSchema = z.enum(["month", "last30", "custom"]);
const scopeMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const scopeDateSchema = z.iso.date();
const mapLayerSchema = z.enum(mapLayerValues);
const storedSelectionSchema = z.object({
  mode: scopeModeSchema,
  month: scopeMonthSchema,
  from: scopeDateSchema,
  to: scopeDateSchema,
});

/** First-visit scope (current PHT month to date) and the map's own default. */
export function defaultDashboardPreferences(
  today: string = manilaDateAt(),
): DashboardPreferences {
  const month = today.slice(0, 7);
  return {
    selection: { mode: "month", month, from: `${month}-01`, to: today },
    mapLayer: "barangay",
  };
}

function readStoredSelection(
  value: unknown,
  today: string,
): ScopeSelection | undefined {
  const parsed = storedSelectionSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const selection = parsed.data;
  if (selection.mode === "month") {
    // A month that has not started yet cannot hold reports, so it is a
    // leftover value rather than a choice worth restoring.
    if (selection.month > today.slice(0, 7)) return undefined;
    return selection;
  }
  if (selection.mode === "custom") {
    if (selection.from > selection.to) return undefined;
    if (selection.from > today) return undefined;
  }
  // `last30` is resolved from today on every read, so its stored dates are
  // inert and can never go stale.
  return selection;
}

/**
 * Validate one stored payload. The version gate comes first: an unreadable
 * version is the migration seam, where a future release converts an older
 * shape instead of guessing at it.
 */
export function parseDashboardPreferences(
  value: unknown,
  today: string = manilaDateAt(),
): DashboardPreferences {
  const defaults = defaultDashboardPreferences(today);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }
  const stored = value as Record<string, unknown>;
  if (stored.version !== DASHBOARD_PREFERENCES_VERSION) return defaults;

  const layer = mapLayerSchema.safeParse(stored.mapLayer);
  return {
    selection: readStoredSelection(stored.selection, today) ?? defaults.selection,
    mapLayer: layer.success ? layer.data : defaults.mapLayer,
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Blocked storage is not a page failure: the dashboard still renders and
    // simply forgets between visits.
    return null;
  }
}

export function readDashboardPreferences(
  storage: Storage | null = browserStorage(),
  today: string = manilaDateAt(),
): DashboardPreferences {
  if (!storage) return defaultDashboardPreferences(today);

  let raw: string | null;
  try {
    raw = storage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY);
  } catch {
    return defaultDashboardPreferences(today);
  }
  if (!raw) return defaultDashboardPreferences(today);

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaultDashboardPreferences(today);
  }
  return parseDashboardPreferences(value, today);
}

/**
 * Merge a patch into the stored payload. Each control saves only its own
 * slice, so two components writing different controls never clobber the other.
 */
function writeDashboardPreferences(
  patch: Partial<DashboardPreferences>,
  storage: Storage | null = browserStorage(),
  today: string = manilaDateAt(),
) {
  if (!storage) return;
  const next = { ...readDashboardPreferences(storage, today), ...patch };
  try {
    storage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: DASHBOARD_PREFERENCES_VERSION,
        selection: next.selection,
        mapLayer: next.mapLayer,
      }),
    );
  } catch {
    // A full or blocked store leaves the dashboard usable without memory.
  }
}

export function saveDashboardScope(
  selection: ScopeSelection,
  storage: Storage | null = browserStorage(),
  today: string = manilaDateAt(),
) {
  writeDashboardPreferences({ selection }, storage, today);
}

export function saveDashboardMapLayer(
  mapLayer: MapLayer,
  storage: Storage | null = browserStorage(),
  today: string = manilaDateAt(),
) {
  writeDashboardPreferences({ mapLayer }, storage, today);
}
