import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { FieldValidationFilterBar } from "../components/fieldValidation/FieldValidationFilterBar";
import { FieldValidationQueuePanel } from "../components/fieldValidation/FieldValidationQueuePanel";
import { FieldValidationTable } from "../components/fieldValidation/FieldValidationTable";
import { ValidationMap } from "../components/fieldValidation/ValidationMap";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { diseaseLabels, reviewStatusLabels } from "../domain/report.metadata";
import type { FieldValidationFilters } from "../domain/fieldValidation.types";
import { useFieldValidationMap, useFieldValidationQueue } from "../hooks/useFieldValidation";
import { routes } from "../app/routes";
import { parseMapUrl, writeMapUrl } from "./mapUrlState";

function isAccessDeniedError(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function isMalformedDataError(error: unknown) {
  return error instanceof ZodError;
}

function errorMessage(error: unknown, area: string) {
  if (isAccessDeniedError(error)) {
    return `Your account does not have access to the field-validation ${area}.`;
  }
  if (isRateLimitedError(error)) {
    return `The field-validation ${area} is receiving too many requests. Wait a moment, then try again.`;
  }
  if (isMalformedDataError(error)) {
    return `CaneGuard returned an unexpected ${area} format. Refresh after the service is corrected.`;
  }
  if (isApiConnectionError(error)) {
    return `Cannot connect to the CaneGuard API for the field-validation ${area}. Start the API server and verify VITE_API_BASE_URL points to the same host and port as this Web preview.`;
  }
  return `The field-validation ${area} is unavailable. Please try again.`;
}

function coverageMessage({
  totalCount,
  locatedCount,
  unlocatedCount,
  limit,
  returnedCount,
  truncated,
}: {
  totalCount: number;
  locatedCount: number;
  unlocatedCount: number;
  limit: number;
  returnedCount: number;
  truncated: boolean;
}) {
  if (totalCount === 0) {
    return "No reports match the applied filters.";
  }

  const truncation = truncated
    ? ` Showing ${returnedCount} of ${totalCount} matching reports on the map (limit ${limit}); narrow the filters to see additional locations.`
    : "";
  const counts = `${locatedCount} located, ${unlocatedCount} unlocated.${truncation}`;
  if (unlocatedCount > 0) {
    const reportLabel = unlocatedCount === 1 ? "report has" : "reports have";
    return `${counts} ${unlocatedCount} filtered ${reportLabel} no valid coordinate pair. Continue in the queue or open the submitted report table to review every report.`;
  }

  return `${counts} All filtered reports with location data have a valid coordinate pair.`;
}

function WorkspaceAreaError({
  area,
  error,
  onRetry,
}: {
  area: "map" | "queue";
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="validation-workspace__error">
      <ErrorState message={errorMessage(error, area)} onRetry={onRetry} />
    </div>
  );
}

function FilterChips({
  filters,
  onRemove,
}: {
  filters: FieldValidationFilters;
  onRemove: (key: keyof FieldValidationFilters) => void;
}) {
  const chips: Array<{ key: keyof FieldValidationFilters; label: string }> = [];
  if (filters.queue) {
    chips.push({
      key: "queue",
      label: filters.queue === "follow_up_due"
        ? "Queue: Follow-up due"
        : filters.queue === "upcoming"
          ? "Queue: Upcoming visits"
          : "Queue: Needs visit",
    });
  }
  if (filters.dateFrom) chips.push({ key: "dateFrom", label: `From ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: "dateTo", label: `To ${filters.dateTo}` });
  if (filters.disease) chips.push({ key: "disease", label: diseaseLabels[filters.disease] });
  if (filters.barangay) chips.push({ key: "barangay", label: `Barangay: ${filters.barangay}` });
  if (filters.status) chips.push({ key: "status", label: `Map: ${reviewStatusLabels[filters.status]}` });

  if (chips.length === 0) {
    return <p className="field-validation-filter-bar__hint">Showing active review states. Resolved points stay hidden until selected.</p>;
  }

  return (
    <div className="filter-chips" aria-label="Applied map filters">
      <span>Applied:</span>
      {chips.map(({ key, label }) => (
        <button type="button" className="filter-chip" key={key} onClick={() => onRemove(key)}>
          {label}<span aria-hidden="true">×</span><span className="sr-only">Remove {label}</span>
        </button>
      ))}
    </div>
  );
}

export function FieldValidationMapPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseMapUrl(searchParams), [searchParams]);
  const appliedFilters = urlState.filters;

  const mapQuery = useFieldValidationMap(appliedFilters, { enabled: !urlState.invalid });
  const queueQuery = useFieldValidationQueue(appliedFilters, { enabled: !urlState.invalid });
  const mapData = mapQuery.data;
  const queueData = queueQuery.data;
  const mapAccessDenied = isAccessDeniedError(mapQuery.error);
  const queueAccessDenied = isAccessDeniedError(queueQuery.error);
  const visibleMapData = mapAccessDenied ? undefined : mapData;
  const visibleQueueData = queueAccessDenied ? undefined : queueData;
  const hasMapCachedData = Boolean(visibleMapData);
  const hasQueueCachedData = Boolean(visibleQueueData);
  const mapInitialError = mapAccessDenied || (mapQuery.isError && !hasMapCachedData);
  const queueInitialError = queueAccessDenied || (queueQuery.isError && !hasQueueCachedData);
  const mapFrameKey = JSON.stringify(appliedFilters);
  const isFollowUpDue = appliedFilters.queue === "follow_up_due";
  const isUpcoming = appliedFilters.queue === "upcoming";

  const writeWorkspaceUrl = (filters: FieldValidationFilters) => {
    const next = writeMapUrl(filters);
    if (embedded) next.set("view", "map");
    return next;
  };

  const applyFilters = (draft: FieldValidationFilters) => {
    setSearchParams(writeWorkspaceUrl({
      ...draft,
      barangay: draft.barangay?.trim() || undefined,
    }));
  };

  const clearFilters = () => {
    setSearchParams(embedded ? new URLSearchParams("view=map") : new URLSearchParams());
  };

  const removeFilter = (key: keyof FieldValidationFilters) => {
    const next = { ...appliedFilters };
    delete next[key];
    setSearchParams(writeWorkspaceUrl(next));
  };

  const refresh = () => {
    void Promise.all([mapQuery.refetch(), queueQuery.refetch()]);
  };

  return (
    <PageContent className={`page-content--field-validation${embedded ? " page-content--embedded" : ""}`}>
      {!embedded ? <PageHeader
        eyebrow="Field operations"
        title={isFollowUpDue
          ? "Follow-up due workspace"
          : isUpcoming
            ? "Upcoming visits workspace"
            : "Field-validation map"}
        description={isFollowUpDue
          ? "Review open submitted reports whose target visit date has passed while field validation remains incomplete. Possible Conditions are decision support, not Staff-Classified Conditions."
          : isUpcoming
            ? "Review open submitted reports with a target visit date today or later. Possible Conditions are decision support, not Staff-Classified Conditions."
            : "Locate submitted observations and prioritize the oldest submitted reports awaiting an on-site validation. Possible Conditions are decision support, not Staff-Classified Conditions."}
        actions={(
          <Button
            variant="secondary"
            icon={<RefreshCw aria-hidden="true" className={mapQuery.isFetching || queueQuery.isFetching ? "spin" : undefined} />}
            disabled={urlState.invalid || mapQuery.isFetching || queueQuery.isFetching}
            onClick={refresh}
          >
            {mapQuery.isFetching || queueQuery.isFetching ? "Refreshing workspace" : "Refresh workspace"}
          </Button>
        )}
      /> : null}

      <section className="field-validation-workspace-card" aria-labelledby="field-validation-filters-heading">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Applied workspace filters</p>
            <h2 id="field-validation-filters-heading">Observation filters</h2>
          </div>
          <span>Dates use observed_at; null observation dates are excluded when a date range is set.</span>
        </div>
        <FieldValidationFilterBar
          key={searchParams.toString()}
          applied={appliedFilters}
          onApply={applyFilters}
          onClear={clearFilters}
        />
        <FilterChips filters={appliedFilters} onRemove={removeFilter} />
      </section>

      {urlState.invalid ? (
        <ErrorState
          message="The map URL contains an invalid filter. Clear the filters to return to the field-validation workspace."
          onRetry={clearFilters}
        />
      ) : null}

      {!urlState.invalid ? (
        <>
          {mapQuery.isRefetchError || queueQuery.isRefetchError ? (
            <p className="queue-refresh-warning" role="alert">
              {isApiConnectionError(mapQuery.error) || isApiConnectionError(queueQuery.error)
                ? "Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL; the most recently loaded map and queue remain visible."
                : "The latest workspace refresh failed. Showing the most recently loaded map and queue where available."}
            </p>
          ) : null}
          {mapQuery.isFetching || queueQuery.isFetching ? (
            <p className="queue-refresh-status" role="status">Refreshing the field-validation workspace...</p>
          ) : null}
          {visibleMapData ? (
            <p className="field-validation-coverage" role="status">
              {coverageMessage(visibleMapData.metadata)} <Link to={routes.reports}>Open the submitted report table.</Link>
            </p>
          ) : null}
          <div className="validation-workspace">
            <div className="validation-workspace__map-column">
              {visibleMapData ? (
                <details className="field-validation-locations">
                  <summary className="field-validation-locations__summary">
                    <span>Map and located observations</span>
                    <span>{visibleMapData.features.length} {visibleMapData.features.length === 1 ? "row" : "rows"}</span>
                  </summary>
                  <ValidationMap
                    data={visibleMapData}
                    frameKey={mapFrameKey}
                    isPlaceholderData={mapQuery.isPlaceholderData}
                  />
                  <FieldValidationTable features={visibleMapData.features} />
                </details>
              ) : mapInitialError ? (
                <WorkspaceAreaError area="map" error={mapQuery.error} onRetry={() => mapQuery.refetch()} />
              ) : (
                <LoadingState message="Loading the field-validation map..." />
              )}
            </div>
            {visibleQueueData ? (
              <FieldValidationQueuePanel data={visibleQueueData} />
            ) : queueInitialError ? (
              <WorkspaceAreaError area="queue" error={queueQuery.error} onRetry={() => queueQuery.refetch()} />
            ) : (
              <LoadingState message="Loading the validation queue..." />
            )}
          </div>
        </>
      ) : null}
    </PageContent>
  );
}
