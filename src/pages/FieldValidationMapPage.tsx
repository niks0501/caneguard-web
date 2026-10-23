import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { MapPinOff, RefreshCw } from "lucide-react";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { FieldValidationFilterBar } from "../components/fieldValidation/FieldValidationFilterBar";
import { CaseDetailsPanel, ClusterQueuePanel } from "../components/fieldValidation/MapSidebar";
import { ValidationMap, type ValidationMapSelection } from "../components/fieldValidation/ValidationMap";
import { locationGroupMembers } from "../components/fieldValidation/locationGroups";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { diseaseLabels, reviewStatusLabels } from "../domain/report.metadata";
import type { FieldValidationMapFeature, FieldValidationFilters } from "../domain/fieldValidation.types";
import { useFieldValidationMap } from "../hooks/useFieldValidation";
import { routes } from "../app/routes";
import { env } from "../config/env";
import { apiEndpointDetail, serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";
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

function errorMessage(error: unknown) {
  if (isAccessDeniedError(error)) {
    return "Your account does not have access to the Monitoring Map.";
  }
  if (isRateLimitedError(error)) {
    return "The Monitoring Map is receiving too many requests. Wait a moment, then try again.";
  }
  if (isMalformedDataError(error)) {
    return "CaneGuard returned an unexpected Map format. Refresh after the service is corrected.";
  }
  if (isApiConnectionError(error)) {
    return serviceUnreachableMessage;
  }
  return "The Monitoring Map is unavailable. Please try again.";
}

type MapSelection =
  | {
    kind: "case";
    caseUuid: string;
    coordinates: [number, number] | null;
    fromClusterKeys?: string[];
    fromClusterCoordinates?: [number, number];
  }
  | { kind: "cluster"; clusterKeys: string[]; coordinates: [number, number] };

const queueChipLabels: Record<string, string> = {
  needs_visit: "Need Visit",
  follow_up_due: "Overdue",
  upcoming: "Upcoming",
};

function FilterChips({
  filters,
  onRemove,
}: {
  filters: FieldValidationFilters;
  onRemove: (key: keyof FieldValidationFilters) => void;
}) {
  const chips: Array<{ key: keyof FieldValidationFilters; label: string }> = [];
  if (filters.queue) chips.push({ key: "queue", label: queueChipLabels[filters.queue] ?? filters.queue });
  if (filters.status) chips.push({ key: "status", label: `Case Status: ${reviewStatusLabels[filters.status]}` });
  if (filters.disease) chips.push({ key: "disease", label: diseaseLabels[filters.disease] });
  if (filters.barangay) chips.push({ key: "barangay", label: `Barangay: ${filters.barangay}` });
  if (filters.dateFrom) chips.push({ key: "dateFrom", label: `Observed from ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: "dateTo", label: `Observed to ${filters.dateTo}` });

  if (chips.length === 0) {
    return <p className="field-validation-filter-bar__hint">Showing active cases. Resolved cases stay hidden until selected.</p>;
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
  const navigate = useNavigate();
  const urlState = useMemo(() => parseMapUrl(searchParams), [searchParams]);
  const appliedFilters = urlState.filters;
  const reportParam = searchParams.get("report");

  const mapQuery = useFieldValidationMap(appliedFilters, { enabled: !urlState.invalid });
  const mapAccessDenied = isAccessDeniedError(mapQuery.error);
  const mapData = mapAccessDenied ? undefined : mapQuery.data;
  const hasCachedData = Boolean(mapData);
  const mapInitialError = mapAccessDenied || (mapQuery.isError && !hasCachedData);
  const mapFrameKey = JSON.stringify(appliedFilters);

  const [userSelection, setUserSelection] = useState<MapSelection | null>(null);

  const writeWorkspaceUrl = (filters: FieldValidationFilters) => {
    const next = writeMapUrl(filters);
    if (embedded) next.set("view", "map");
    return next;
  };

  // Deep links to a focused Map case keep resolving to an equivalent state
  // without an effect that mutates selection during render cascades.
  const selection = useMemo<MapSelection | null>(() => {
    if (userSelection) return userSelection;
    if (!reportParam) return null;
    const feature = mapData?.features.find((item) => item.properties.uuid === reportParam);
    if (feature) {
      return {
        kind: "case",
        caseUuid: reportParam,
        coordinates: feature.properties.locationGroupCoordinates ?? feature.geometry.coordinates,
      };
    }
    if (mapData) return { kind: "case", caseUuid: reportParam, coordinates: null };
    return null;
  }, [userSelection, reportParam, mapData]);

  const applyFilters = (draft: FieldValidationFilters) => {
    setSearchParams(writeWorkspaceUrl({ ...draft, barangay: draft.barangay?.trim() || undefined }));
  };

  const clearFilters = () => {
    setSearchParams(embedded ? new URLSearchParams("view=map") : new URLSearchParams());
  };

  const removeFilter = (key: keyof FieldValidationFilters) => {
    const next = { ...appliedFilters };
    delete next[key];
    setSearchParams(writeWorkspaceUrl(next));
  };

  const applyQueueScope = (queue: FieldValidationFilters["queue"]) => {
    setSearchParams(writeWorkspaceUrl({ ...appliedFilters, queue }));
  };

  // The work scope travels with the reviewer: an Overdue map opens an Overdue
  // register, not an unfiltered one that merely looks like the same workflow.
  const registerUrl = (location: "located" | "unlocated" | null) => {
    const params = new URLSearchParams();
    if (appliedFilters.queue) params.set("queue", appliedFilters.queue);
    if (appliedFilters.barangay) params.set("barangay", appliedFilters.barangay);
    if (appliedFilters.disease) params.set("predicted_label", appliedFilters.disease);
    if (appliedFilters.dateFrom) params.set("date_from", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("date_to", appliedFilters.dateTo);
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    if (location) params.set("location", location);
    const query = params.toString();
    return query ? `${routes.reports}?${query}` : routes.reports;
  };

  const selectCase = (feature: FieldValidationMapFeature, fromCluster?: { clusterKeys: string[]; coordinates: [number, number] }) => {
    setUserSelection({
      kind: "case",
      caseUuid: feature.properties.uuid,
      coordinates: feature.properties.locationGroupCoordinates ?? feature.geometry.coordinates,
      fromClusterKeys: fromCluster?.clusterKeys,
      fromClusterCoordinates: fromCluster?.coordinates,
    });
    const next = new URLSearchParams(searchParams);
    next.set("report", feature.properties.uuid);
    setSearchParams(next, { replace: true });
  };

  const handleMapSelect = (next: ValidationMapSelection) => {
    if (next.kind === "cluster") {
      const keys = next.clusterKeys ?? [];
      setUserSelection({ kind: "cluster", clusterKeys: keys, coordinates: next.coordinates });
      const params = new URLSearchParams(searchParams);
      params.delete("report");
      setSearchParams(params, { replace: true });
      return;
    }
    const feature = mapData?.features.find((item) => item.properties.uuid === next.caseUuid);
    if (feature) selectCase(feature);
  };

  const closeSidebar = () => {
    setUserSelection(null);
    const next = new URLSearchParams(searchParams);
    next.delete("report");
    setSearchParams(next, { replace: true });
  };

  const clusterMembers = useMemo(() => {
    if (selection?.kind !== "cluster" || !mapData) return [];
    return selection.clusterKeys.flatMap((key) => locationGroupMembers(mapData.features, key));
  }, [selection, mapData]);

  const selectedFeature = selection?.kind === "case"
    ? mapData?.features.find((item) => item.properties.uuid === selection.caseUuid) ?? null
    : null;

  const returnToArea = () => {
    if (selection?.kind !== "case" || !selection.fromClusterKeys || !selection.fromClusterCoordinates) return;
    setUserSelection({ kind: "cluster", clusterKeys: selection.fromClusterKeys, coordinates: selection.fromClusterCoordinates });
    const params = new URLSearchParams(searchParams);
    params.delete("report");
    setSearchParams(params, { replace: true });
  };

  const providerSelection = useMemo<ValidationMapSelection | null>(() => {
    if (selection?.kind === "cluster") {
      return { kind: "cluster", clusterKeys: selection.clusterKeys, coordinates: selection.coordinates };
    }
    if (selection?.kind === "case" && selection.coordinates) {
      return { kind: "case", caseUuid: selection.caseUuid, coordinates: selection.coordinates };
    }
    return null;
  }, [selection]);

  const summary = useMemo(() => ({
    activeCases: mapData?.metadata.totalCount ?? 0,
    needVisit: mapData?.metadata.needVisitCount ?? 0,
    overdue: mapData?.metadata.overdueCount ?? 0,
    noLocation: mapData?.metadata.unlocatedCount ?? 0,
  }), [mapData]);

  // Loading, unavailable and a genuine zero are different answers. A count is
  // never rendered as 0 before a successful read.
  const summaryState: "loading" | "unavailable" | "ready" = mapData
    ? "ready"
    : mapInitialError ? "unavailable" : "loading";
  const summaryCount = (value: number) => summaryState === "ready"
    ? value
    : summaryState === "unavailable" ? "Unavailable" : "—";

  const mapErrorDetail = isApiConnectionError(mapQuery.error)
    ? apiEndpointDetail(env.apiBaseUrl)
    : undefined;

  const sidebar = (() => {
    if (selection?.kind === "cluster") {
      return (
        <ClusterQueuePanel
          members={clusterMembers}
          truncated={Boolean(mapData?.metadata.truncated)}
          onSelectCase={(feature) => selectCase(feature, { clusterKeys: selection.clusterKeys, coordinates: selection.coordinates })}
          onClose={closeSidebar}
        />
      );
    }
    if (selection?.kind === "case" && selectedFeature) {
      return (
        <CaseDetailsPanel
          feature={selectedFeature}
          onClose={closeSidebar}
          onReturnToArea={selection.fromClusterKeys ? returnToArea : undefined}
        />
      );
    }
    if (selection?.kind === "case") {
      return (
        <aside className="map-sidebar" aria-labelledby="map-sidebar-heading">
          <div className="map-sidebar__heading">
            <h2 id="map-sidebar-heading">Case not on this map</h2>
          </div>
          <p className="map-sidebar__note">
            This case is not in the current filtered Map scope, or it has no usable location.
          </p>
          <div className="map-sidebar__actions">
            <Link className="button button--secondary" to={routes.reportDetail(selection.caseUuid)}>Open Case</Link>
          </div>
        </aside>
      );
    }
    return null;
  })();

  return (
    <PageContent className={`page-content--field-validation${embedded ? " page-content--embedded" : ""}`}>
      {!embedded ? (
        <PageHeader
          eyebrow="Field operations"
          title="Monitoring Map"
          description="Where are the reported cases, and which ones need attention?"
          actions={(
            <Button
              variant="secondary"
              icon={<RefreshCw aria-hidden="true" className={mapQuery.isFetching ? "spin" : undefined} />}
              disabled={urlState.invalid || mapQuery.isFetching}
              onClick={() => void mapQuery.refetch()}
            >
              {mapQuery.isFetching ? "Refreshing map" : "Refresh map"}
            </Button>
          )}
        />
      ) : null}

      <section className="field-validation-workspace-card" aria-labelledby="field-validation-filters-heading">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Applied workspace filters</p>
            <h2 id="field-validation-filters-heading">Case filters</h2>
          </div>
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
          message="The map URL contains an invalid filter. Clear the filters to return to the Map workspace."
          onRetry={clearFilters}
        />
      ) : null}

      {!urlState.invalid ? (
        <>
          {mapQuery.isRefetchError && hasCachedData ? (
            <p className="queue-refresh-warning" role="alert">
              {isApiConnectionError(mapQuery.error)
                ? serviceUnreachableWhileShowingData
                : "The latest Map refresh failed. The most recently loaded map is still shown and may be stale."}
            </p>
          ) : null}

          <ul className="map-summary" aria-label="Map summary">
            <li>
              <button type="button" className={`map-summary__action${appliedFilters.queue === undefined ? " is-active" : ""}`} onClick={() => applyQueueScope(undefined)}>
                <span className="map-summary__label">Active Cases</span>
                <strong>{summaryCount(summary.activeCases)}</strong>
              </button>
            </li>
            <li>
              <button type="button" className={`map-summary__action${appliedFilters.queue === "needs_visit" ? " is-active" : ""}`} onClick={() => applyQueueScope("needs_visit")}>
                <span className="map-summary__label">Need Visit</span>
                <strong>{summaryCount(summary.needVisit)}</strong>
              </button>
            </li>
            <li>
              <button type="button" className={`map-summary__action${appliedFilters.queue === "follow_up_due" ? " is-active" : ""}`} onClick={() => applyQueueScope("follow_up_due")}>
                <span className="map-summary__label">Overdue</span>
                <strong>{summaryCount(summary.overdue)}</strong>
              </button>
            </li>
            <li>
              <button type="button" className="map-summary__action" onClick={() => navigate(registerUrl("unlocated"))}>
                <span className="map-summary__label">No Location</span>
                <strong>{summaryCount(summary.noLocation)}</strong>
              </button>
            </li>
          </ul>

          <div className={`validation-workspace${sidebar ? " is-split" : ""}`}>
            <div className="validation-workspace__map-column">
              {mapData ? (
                <ValidationMap
                  data={mapData}
                  frameKey={mapFrameKey}
                  isPlaceholderData={mapQuery.isPlaceholderData}
                  selection={providerSelection}
                  onSelect={handleMapSelect}
                  onClearSelection={closeSidebar}
                />
              ) : mapInitialError ? (
                <div className="validation-workspace__error">
                  <ErrorState message={errorMessage(mapQuery.error)} detail={mapErrorDetail} onRetry={() => void mapQuery.refetch()} />
                </div>
              ) : (
                <LoadingState message="Loading the Monitoring Map..." />
              )}
            </div>
            {sidebar}
          </div>

          {mapData ? (
            <section className="map-secondary-list" aria-labelledby="map-secondary-heading">
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">Reports Without Location</p>
                  <h2 id="map-secondary-heading">Cases that cannot be plotted</h2>
                </div>
                <span>{summary.noLocation}</span>
              </div>
              <p className="map-secondary-list__note">
                <MapPinOff aria-hidden="true" />
                {summary.noLocation === 0
                  ? "Every matching case has a usable coordinate pair."
                  : `${summary.noLocation} matching ${summary.noLocation === 1 ? "case has" : "cases have"} no usable coordinate pair. They remain accessible in the case list.`}
              </p>
              <div className="map-secondary-list__actions">
                <Link className="button button--secondary" to={registerUrl("unlocated")}>Open Reports Without Location</Link>
                <Link className="button button--quiet" to={registerUrl(null)}>View all cases</Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </PageContent>
  );
}
