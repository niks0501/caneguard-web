import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { ApiError } from "../api/ApiError";
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
  return `The field-validation ${area} is unavailable. Please try again.`;
}

function FilterChips({
  filters,
  onRemove,
}: {
  filters: FieldValidationFilters;
  onRemove: (key: keyof FieldValidationFilters) => void;
}) {
  const chips: Array<{ key: keyof FieldValidationFilters; label: string }> = [];
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

export function FieldValidationMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseMapUrl(searchParams), [searchParams]);
  const appliedFilters = urlState.filters;

  const mapQuery = useFieldValidationMap(appliedFilters, { enabled: !urlState.invalid });
  const queueQuery = useFieldValidationQueue(appliedFilters, { enabled: !urlState.invalid });
  const mapData = mapQuery.data;
  const queueData = queueQuery.data;
  const mapAccessDenied = isAccessDeniedError(mapQuery.error);
  const queueAccessDenied = isAccessDeniedError(queueQuery.error);
  const hasMapCachedData = Boolean(mapData);
  const hasQueueCachedData = Boolean(queueData);
  const mapInitialError = mapAccessDenied || (mapQuery.isError && !hasMapCachedData);
  const queueInitialError = queueAccessDenied || (queueQuery.isError && !hasQueueCachedData);

  const applyFilters = (draft: FieldValidationFilters) => {
    setSearchParams(writeMapUrl({
      ...draft,
      barangay: draft.barangay?.trim() || undefined,
    }));
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const removeFilter = (key: keyof FieldValidationFilters) => {
    const next = { ...appliedFilters };
    delete next[key];
    setSearchParams(writeMapUrl(next));
  };

  const refresh = () => {
    void Promise.all([mapQuery.refetch(), queueQuery.refetch()]);
  };

  return (
    <PageContent className="page-content--field-validation">
      <PageHeader
        eyebrow="Field operations"
        title="Field-validation map"
        description="Locate submitted observations and prioritize the oldest reports awaiting an on-site validation. Possible AI results are decision support, not staff confirmation."
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
      />

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

      {!urlState.invalid && mapInitialError ? (
        <ErrorState message={errorMessage(mapQuery.error, "map")} onRetry={() => mapQuery.refetch()} />
      ) : null}
      {!urlState.invalid && queueInitialError && !mapInitialError ? (
        <ErrorState message={errorMessage(queueQuery.error, "queue")} onRetry={() => queueQuery.refetch()} />
      ) : null}

      {!urlState.invalid && !mapInitialError && !queueInitialError ? (
        <>
          {mapQuery.isRefetchError || queueQuery.isRefetchError ? (
            <p className="queue-refresh-warning" role="alert">
              The latest workspace refresh failed. Showing the most recently loaded map and queue.
            </p>
          ) : null}
          {mapQuery.isFetching || queueQuery.isFetching ? (
            <p className="queue-refresh-status" role="status">Refreshing the field-validation workspace...</p>
          ) : null}
          {mapData && queueData ? (
            <>
              <p className="field-validation-coverage" role="status">
                {mapData.metadata.unlocatedCount > 0 ? (
                  <>
                    {mapData.metadata.unlocatedCount} filtered {mapData.metadata.unlocatedCount === 1 ? "report has" : "reports have"} no valid coordinate pair. Continue in the queue or <Link to={routes.reports}>open the submitted report table</Link>.
                  </>
                ) : "All filtered reports with location data have a valid coordinate pair."}
              </p>
              <div className="validation-workspace">
                <div className="validation-workspace__map-column">
                  <ValidationMap data={mapData} />
                  <FieldValidationTable features={mapData.features} />
                </div>
                <FieldValidationQueuePanel data={queueData} />
              </div>
            </>
          ) : (
            <LoadingState message="Loading the field-validation map and queue..." />
          )}
        </>
      ) : null}
    </PageContent>
  );
}
