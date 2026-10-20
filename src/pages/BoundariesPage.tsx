import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { BoundariesList } from "../components/boundaries/BoundariesList";
import { BoundariesMap } from "../components/boundaries/BoundariesMap";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { FIELD_SURVEYS_MAX_LIMIT, type FieldSurveyPosition } from "../domain/fieldSurvey.types";
import { useFieldSurveys } from "../hooks/fieldSurveys";
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
  if (isApiConnectionError(error)) return "Cannot connect to the CaneGuard API for field boundaries. Verify the API is reachable, then try again.";
  return "Field boundaries are unavailable. Please try again.";
}

export function BoundariesPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useFieldSurveys(FIELD_SURVEYS_MAX_LIMIT);
  const [popupSelection, setPopupSelection] = useState<{ id: string; coordinates: FieldSurveyPosition } | null>(null);
  const accessDenied = isAccessDeniedError(query.error);
  const unauthenticated = isUnauthorizedError(query.error);
  const cannotDisplayCachedData = accessDenied || unauthenticated;
  const data = cannotDisplayCachedData ? undefined : query.data;
  const hasCachedData = Boolean(query.data);
  const boundaryParam = searchParams.get("boundary");
  const selectedFeature = boundaryParam && data
    ? data.features.find((feature) => String(feature.properties.id) === boundaryParam) ?? null
    : null;
  const boundaryUnavailable = Boolean(
    boundaryParam
      && data
      && query.isSuccess
      && !query.isFetching
      && !query.isError
      && !query.isRefetchError
      && !selectedFeature,
  );
  const selectedBoundaryId = selectedFeature ? boundaryParam : null;
  const popupCoordinates = selectedBoundaryId && popupSelection?.id === selectedBoundaryId
    ? popupSelection.coordinates
    : null;

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
          title="Field boundaries"
          description="Recorded plot outlines, newest first."
          actions={(
            <Button
              variant="secondary"
              icon={<RefreshCw aria-hidden="true" className={query.isFetching ? "spin" : undefined} />}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? "Refreshing boundaries" : "Refresh boundaries"}
            </Button>
          )}
        />
      ) : null}
      {query.isRefetchError && hasCachedData && !cannotDisplayCachedData ? (
        <p className="queue-refresh-warning" role="alert">
          {query.error instanceof ZodError
            ? "CaneGuard returned an unexpected boundary format. Refresh after the service is corrected. The most recently loaded boundaries are still shown and may be stale."
            : isApiConnectionError(query.error)
              ? "Cannot connect to the CaneGuard API. The most recently loaded boundaries are still shown and may be stale."
              : "The latest boundary refresh failed. The most recently loaded boundaries are still shown and may be stale."}
        </p>
      ) : null}
      {boundaryUnavailable ? (
        <p className="queue-refresh-status" role="status">
          The requested boundary is not available in the loaded field boundaries.
        </p>
      ) : null}
      {query.isPending && !data ? <LoadingState message="Loading field boundaries..." /> : null}
      {query.isError && !data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {data ? (
        <div className="boundaries-workspace">
          <BoundariesMap
            data={data}
            selectedBoundaryId={selectedBoundaryId}
            popupCoordinates={popupCoordinates}
            onSelect={selectFromMap}
            onClearSelection={clearSelection}
          />
          <BoundariesList
            data={data}
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
