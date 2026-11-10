import type { FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";

/**
 * Which boundary the office viewer shows as selected, and whether it can open.
 * `loading`, `missing` and `unavailable` only arise for a boundary asked for by
 * number that is not in the loaded newest page and is fetched by id instead.
 */
export type BoundarySelectionState =
  | "none"
  | "list"
  | "map"
  | "loading"
  | "missing"
  | "unavailable";

export type BoundaryLookup = "idle" | "loading" | "error" | "done";

export function isBoundaryNumber(value: string | null): value is string {
  return value !== null && /^\d+$/.test(value) && Number(value) > 0;
}

/** True when the asked-for boundary must be fetched by its number. */
export function boundaryNeedsLookup(
  requestedId: string | null,
  loaded: FieldSurveyBoundaryFeature | null,
  listLoaded: boolean,
): boolean {
  return isBoundaryNumber(requestedId) && listLoaded && loaded === null;
}

export function boundarySelectionState({
  requestedId,
  feature,
  lookup,
  openedOnMap,
}: {
  requestedId: string | null;
  feature: FieldSurveyBoundaryFeature | null;
  lookup: BoundaryLookup;
  openedOnMap: boolean;
}): BoundarySelectionState {
  if (requestedId === null) return "none";
  if (feature) return openedOnMap ? "map" : "list";
  if (!isBoundaryNumber(requestedId)) return "missing";
  if (lookup === "loading") return "loading";
  if (lookup === "error") return "unavailable";
  if (lookup === "done") return "missing";
  return "loading";
}
