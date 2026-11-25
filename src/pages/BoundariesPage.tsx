import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { BoundariesList } from "../components/boundaries/BoundariesList";
import { BoundariesMap } from "../components/boundaries/BoundariesMap";
import { FieldMapFilters } from "../components/boundaries/FieldMapFilters";
import {
  fieldMapFiltersActive,
  fieldMapInspectors,
  filterFieldMaps,
  NO_FIELD_MAP_FILTERS,
  type FieldMapFilters as Filters,
} from "../components/boundaries/fieldMapStatus";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { FIELD_SURVEYS_MAX_LIMIT, type FieldSurveyPosition } from "../domain/fieldSurvey.types";
import { useFieldSurveyById, useFieldSurveys } from "../hooks/fieldSurveys";
import {
  boundaryNeedsLookup,
  boundarySelectionState,
  type BoundaryLookup,
} from "../components/boundaries/boundarySelection";
import { env } from "../config/env";
import { apiEndpointDetail, serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";
import { useSearchParams } from "react-router";

function isAccessDeniedError(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function errorMessage(error: unknown) {
  if (isAccessDeniedError(error)) return "Your account does not have access to field boundaries.";
  if (isUnauthorizedError(error)) return "Your office session has expired. Sign in to view field boundaries.";
  if (isRateLimitedError(error)) return "Field boundaries are receiving too many requests. Wait a moment, then try again.";
  if (error instanceof ZodError) return "CaneGuard returned an unexpected boundary format. Refresh after the service is corrected.";
  if (isApiConnectionError(error)) return serviceUnreachableMessage;
  return "Field boundaries are unavailable. Please try again.";
}

export function BoundariesPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useFieldSurveys(FIELD_SURVEYS_MAX_LIMIT);
  const [filters, setFilters] = useState<Filters>(NO_FIELD_MAP_FILTERS);
  const [popupSelection, setPopupSelection] = useState<{ id: string; coordinates: FieldSurveyPosition } | null>(null);
  const accessDenied = isAccessDeniedError(query.error);
  const unauthenticated = isUnauthorizedError(query.error);
  const cannotDisplayCachedData = accessDenied || unauthenticated;
  const data = cannotDisplayCachedData ? undefined : query.data;
  const hasCachedData = Boolean(query.data);
  const boundaryParam = searchParams.get("boundary");
  const loadedFeature = boundaryParam && data
    ? data.features.find((feature) => String(feature.properties.id) === boundaryParam) ?? null
    : null;
  // A boundary older than the newest page is fetched by its number, so every
  // boundary the office can link to is also one the viewer can open. The lookup
  // target survives a refresh or a failed refresh once the newest page has been
  // shown, and drops only when there is nothing to display.
  const lookupId = boundaryNeedsLookup(boundaryParam, loadedFeature, data !== undefined) ? boundaryParam : null;
  const lookup = useFieldSurveyById(lookupId);
  const selectedFeature = loadedFeature ?? lookup.feature;
  const lookupStatus: BoundaryLookup = lookupId === null
    ? "idle"
    : lookup.query.isError
      ? "error"
      : lookup.query.isSuccess && !lookup.query.isFetching
        ? "done"
        : "loading";
  const selectedBoundaryId = selectedFeature ? boundaryParam : null;
  const popupCoordinates = selectedBoundaryId && popupSelection?.id === selectedBoundaryId
    ? popupSelection.coordinates
    : null;
  const selectionState = boundarySelectionState({
    requestedId: boundaryParam,
    feature: selectedFeature,
    lookup: lookupStatus,
    openedOnMap: popupCoordinates !== null,
  });
  const loadedAt = query.dataUpdatedAt ?? 0;
  const inspectors = useMemo(() => fieldMapInspectors(data?.features ?? []), [data]);
  // A map opened by number stays visible even when the filters would hide it.
  const visible = useMemo(() => {
    if (!data) return undefined;
    // "Last N days" counts back from when the maps were last loaded.
    const matching = filterFieldMaps(data.features, filters, loadedAt);
    const selectedHidden = loadedFeature && !matching.includes(loadedFeature);
    return { ...data, features: selectedHidden ? [...matching, loadedFeature] : matching };
  }, [data, filters, loadedAt, loadedFeature]);
  const mapData = visible && selectedFeature && !loadedFeature
    ? { ...visible, features: [...visible.features, selectedFeature] }
    : visible;

  const updateBoundaryParam = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("boundary", id);
    else next.delete("boundary");
    setSearchParams(next, { replace: true });
  };

  const selectFromList = (id: string) => {
    setPopupSelection(null);
    updateBoundaryParam(id);
  };

  const selectFromMap = (id: string, coordinates: FieldSurveyPosition) => {
    setPopupSelection({ id, coordinates });
    updateBoundaryParam(id);
  };

  const clearSelection = () => {
    setPopupSelection(null);
    updateBoundaryParam(null);
  };

  return (
    <PageContent className={embedded ? "page-content--embedded" : ""}>
      {!embedded ? (
        <PageHeader
          title="Field maps"
          description="Plots the inspectors measured, newest first."
          actions={(
            <Button
              variant="secondary"
              icon={<RefreshCw aria-hidden="true" className={query.isFetching ? "spin" : undefined} />}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? "Refreshing field maps" : "Refresh field maps"}
            </Button>
          )}
        />
      ) : null}
      {query.isRefetchError && hasCachedData && !cannotDisplayCachedData ? (
        <p className="queue-refresh-warning" role="alert">
          {query.error instanceof ZodError
            ? "CaneGuard returned an unexpected boundary format. Refresh after the service is corrected. The most recently loaded boundaries are still shown and may be stale."
            : isApiConnectionError(query.error)
              ? serviceUnreachableWhileShowingData
              : "The latest boundary refresh failed. The most recently loaded boundaries are still shown and may be stale."}
        </p>
      ) : null}
      {selectionState === "missing" ? (
        <p className="queue-refresh-status" role="status">
          Boundary {boundaryParam} was not found.
        </p>
      ) : null}
      {selectionState === "unavailable" ? (
        <p className="queue-refresh-warning" role="alert">
          Boundary {boundaryParam} could not be loaded. Try again in a moment.
        </p>
      ) : null}
      {query.isPending && !data ? <LoadingState message="Loading field boundaries..." /> : null}
      {query.isError && !data ? (
        <ErrorState
          message={errorMessage(query.error)}
          detail={isApiConnectionError(query.error) ? apiEndpointDetail(env.apiBaseUrl) : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {data ? (
        <div className="boundaries-workspace" data-selection-state={selectionState}>
          <FieldMapFilters
            filters={filters}
            inspectors={inspectors}
            shown={visible?.features.length ?? 0}
            loaded={data.features.length}
            onChange={setFilters}
          />
          <BoundariesMap
            data={mapData ?? data}
            selectedBoundaryId={selectedBoundaryId}
            popupCoordinates={popupCoordinates}
            onSelect={selectFromMap}
            onClearSelection={clearSelection}
          />
          <BoundariesList
            data={visible ?? data}
            loadedCount={data.features.length}
            filtered={fieldMapFiltersActive(filters)}
            selectedBoundaryId={selectedBoundaryId}
            onSelect={selectFromList}
            isFetching={query.isFetching}
            onRefresh={embedded ? () => void query.refetch() : undefined}
          />
        </div>
      ) : null}
    </PageContent>
  );
}
