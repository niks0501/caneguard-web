import { routes } from "../app/routes";
import {
  fieldValidationQueueValues,
  operationalQueueValues,
} from "../domain/operationalQueue";

/**
 * One work scope shared by the monitoring views. Moving between List, Map
 * and the no-location list must not silently broaden the results: a supported
 * filter travels with the reviewer, and an unsupported one is named rather than
 * dropped in silence.
 */
export type WorkspaceView = "register" | "calendar" | "map" | "field-operations" | "boundaries";

/** URL keys that describe the work scope (as opposed to view state). */
export const workspaceScopeUrlKeys = [
  "queue",
  "status",
  "predicted_label",
  "barangay",
  "date_from",
  "date_to",
  "location",
] as const;

export type WorkspaceScopeUrlKey = (typeof workspaceScopeUrlKeys)[number];

export const workspaceScopeLabels: Record<WorkspaceScopeUrlKey, string> = {
  queue: "Queue",
  status: "Status",
  predicted_label: "Possible Condition",
  barangay: "Barangay",
  date_from: "From date",
  date_to: "To date",
  location: "Map location",
};

/** Register-only filters that the other views cannot honor. */
const registerOnlyFilterLabels: Record<string, string> = {
  search: "Search",
  concern: "Reported concern",
  case_state: "Case state",
  verification_outcome: "Verification",
  field_validation_state: "Field validation",
  authority_classified_condition: "Staff-classified condition",
  workflow_status: "Status",
  reviewer: "Field Inspector",
  sort: "Sort order",
};

const viewStateKeys = ["calendar_month", "calendar_date"];

const queueValues = new Set<string>(operationalQueueValues);
const mapQueueValues = new Set<string>(fieldValidationQueueValues);

function scopeKeptByView(
  view: WorkspaceView,
  key: WorkspaceScopeUrlKey,
  value: string,
) {
  // A queue value only travels to a view whose own URL schema accepts it.
  if (key === "queue") {
    if (!queueValues.has(value)) return false;
    if (view === "map" && !mapQueueValues.has(value)) return false;
  }
  if (view === "register") return true;
  if (view === "map") return key !== "location";
  return false;
}

/**
 * Build the link to another monitoring view from the current URL. The returned
 * `removed` labels are the exact filters that view cannot honor, so the target
 * can say what changed instead of quietly widening the result set.
 */
export function monitoringViewLink(
  view: WorkspaceView,
  searchParams: URLSearchParams,
): { to: string; removed: string[] } {
  const params = new URLSearchParams();
  const removed: string[] = [];

  for (const key of workspaceScopeUrlKeys) {
    const value = searchParams.get(key)?.trim();
    if (!value) continue;
    if (!scopeKeptByView(view, key, value)) {
      removed.push(workspaceScopeLabels[key]);
      continue;
    }
    params.set(key, value);
  }

  for (const [key, label] of Object.entries(registerOnlyFilterLabels)) {
    const value = searchParams.get(key)?.trim();
    if (!value) continue;
    if (view === "register") params.set(key, value);
    else removed.push(label);
  }

  // The calendar owns its own month/date state.
  if (view === "calendar") {
    for (const key of viewStateKeys) {
      const value = searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }
  }

  // Every view names itself in the URL: /monitoring opens the map, so a List
  // link without `view` would land on the map instead of the case table.
  params.set("view", view);
  return {
    to: `${routes.monitoring}?${params.toString()}`,
    removed: [...new Set(removed)],
  };
}

const workspaceViews = new Set<WorkspaceView>([
  "register",
  "calendar",
  "map",
  "field-operations",
  "boundaries",
]);

/**
 * The view a monitoring URL names. A URL without a view keeps the scope it
 * carries: the List can honor every filter, so a link the Map would widen
 * opens the List, while a bare or fully map-compatible URL opens the Map.
 */
export function monitoringViewFromUrl(searchParams: URLSearchParams): WorkspaceView {
  const requested = searchParams.get("view") as WorkspaceView | null;
  if (requested && workspaceViews.has(requested)) return requested;
  return monitoringViewLink("map", searchParams).removed.length > 0 ? "register" : "map";
}

/** Notice text for a view that could not honor part of the arriving scope. */
export function scopeNoticeMessage(removed: string[]): string | null {
  if (removed.length === 0) return null;
  return `Not applied in this view: ${removed.join(", ")}.`;
}
