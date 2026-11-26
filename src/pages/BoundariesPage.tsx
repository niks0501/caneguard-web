import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { BoundariesList } from "../components/boundaries/BoundariesList";
import { BoundariesMap, type FocusedCaseLocation } from "../components/boundaries/BoundariesMap";
import {
  boundaryNeedsLookup,
  boundarySelectionState,
  type BoundaryLookup,
} from "../components/boundaries/boundarySelection";
import { summarizeCaseFieldMaps } from "../components/boundaries/fieldMapFreshness";
import { FieldMapFilters } from "../components/boundaries/FieldMapFilters";
import {
  fieldMapFiltersActive,
  fieldMapInspectors,
  filterFieldMaps,
  type FieldMapFilters as Filters,
} from "../components/boundaries/fieldMapStatus";
import { parseFieldMapFilters, writeFieldMapFilters } from "../components/boundaries/fieldMapUrlState";
import { PageContent, PageHeader } from "../components/layout/Page";
import { WorkspaceFreshness } from "../components/layout/WorkspaceFreshness";
import {
  createReturnContext,
  readReturnContext,
} from "../components/navigation/mapNavigationContext";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { env } from "../config/env";
import {
  FIELD_SURVEYS_MAX_LIMIT,
  type FieldSurveyBoundaryFeature,
  type FieldSurveyPosition,
} from "../domain/fieldSurvey.types";
import { useFieldSurveyById, useFieldSurveys, useFieldSurveysByIds } from "../hooks/fieldSurveys";
import { useReport } from "../hooks/useReports";
import { formatDateTime } from "../lib/formatters";
import {
  apiEndpointDetail,
  serviceUnreachableMessage,
  serviceUnreachableWhileShowingData,
} from "../lib/serviceMessages";
import "../styles/field-map-navigation.css";

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

function caseContextErrorMessage(error: unknown) {
  if (isAccessDeniedError(error)) return "You do not have permission to view this case's details.";
  if (error instanceof ApiError && error.status === 404) return "This case was not found.";
  if (isApiConnectionError(error)) return serviceUnreachableMessage;
  return "Case details could not be loaded right now.";
}

function dedupeFeatures(features: FieldSurveyBoundaryFeature[]): FieldSurveyBoundaryFeature[] {
  const seen = new Set<string>();
  const result: FieldSurveyBoundaryFeature[] = [];
  for (const feature of features) {
    const id = String(feature.properties.id);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(feature);
  }
  return result;
}

export function BoundariesPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const query = useFieldSurveys(FIELD_SURVEYS_MAX_LIMIT);
  const filters = useMemo(() => parseFieldMapFilters(searchParams), [searchParams]);
  const [popupSelection, setPopupSelection] = useState<{ id: string; coordinates: FieldSurveyPosition } | null>(null);
  const [dismissedAutoSelectReport, setDismissedAutoSelectReport] = useState<string | null>(null);

  const reportParam = searchParams.get("report")?.trim() || null;
  const reportQuery = useReport(reportParam ?? "");
  const focusedReport = reportParam && reportQuery.data ? reportQuery.data : null;
  const caseSummary = useMemo(
    () => (focusedReport ? summarizeCaseFieldMaps(focusedReport) : null),
    [focusedReport],
  );
  const casePlotIds = useMemo(
    () => (caseSummary ? caseSummary.plots.map((plot) => String(plot.fieldSurveyId)) : []),
    [caseSummary],
  );
  const casePlotIdSet = useMemo(() => new Set(casePlotIds), [casePlotIds]);

  const accessDenied = isAccessDeniedError(query.error);
  const unauthenticated = isUnauthorizedError(query.error);
  const cannotDisplayCachedData = accessDenied || unauthenticated;
  const data = cannotDisplayCachedData ? undefined : query.data;
  const hasCachedData = Boolean(query.data);

  const missingCasePlotIds = useMemo(() => {
    if (!data || casePlotIds.length === 0) return [];
    const loadedIds = new Set(data.features.map((feature) => String(feature.properties.id)));
    return casePlotIds.filter((id) => !loadedIds.has(id));
  }, [data, casePlotIds]);
  const caseExtraSurveys = useFieldSurveysByIds(missingCasePlotIds);

  const boundaryParam = searchParams.get("boundary");
  const autoBoundaryId = !boundaryParam
    && reportParam
    && caseSummary?.primaryBoundaryId !== null
    && caseSummary?.primaryBoundaryId !== undefined
    && dismissedAutoSelectReport !== reportParam
    ? String(caseSummary.primaryBoundaryId)
    : null;
  const effectiveBoundaryId = boundaryParam ?? autoBoundaryId;

  const loadedFeature = effectiveBoundaryId && data
    ? data.features.find((feature) => String(feature.properties.id) === effectiveBoundaryId) ?? null
    : null;
  const caseExtraFeature = effectiveBoundaryId
    ? caseExtraSurveys.featuresById.get(effectiveBoundaryId) ?? null
    : null;

  // A boundary older than the newest page is fetched by its number, so every
  // boundary the office can link to is also one the viewer can open. The lookup
  // target survives a refresh or a failed refresh once the newest page has been
  // shown, and drops only when there is nothing to display.
  const handledByCaseLookup = effectiveBoundaryId !== null && missingCasePlotIds.includes(effectiveBoundaryId);
  const lookupId = !handledByCaseLookup && boundaryNeedsLookup(effectiveBoundaryId, loadedFeature, data !== undefined)
    ? effectiveBoundaryId
    : null;
  const lookup = useFieldSurveyById(lookupId);
  const selectedFeature = loadedFeature ?? caseExtraFeature ?? lookup.feature;

  let lookupStatus: BoundaryLookup = "idle";
  if (handledByCaseLookup && effectiveBoundaryId !== null) {
    const idx = missingCasePlotIds.indexOf(effectiveBoundaryId);
    const plotQuery = caseExtraSurveys.queries[idx];
    if (!plotQuery) lookupStatus = "loading";
    else if (plotQuery.isError) lookupStatus = "error";
    else if (plotQuery.isSuccess && !plotQuery.isFetching) lookupStatus = "done";
    else lookupStatus = "loading";
  } else if (lookupId !== null) {
    lookupStatus = lookup.query.isError
      ? "error"
      : lookup.query.isSuccess && !lookup.query.isFetching
        ? "done"
        : "loading";
  }

  const selectedBoundaryId = selectedFeature ? effectiveBoundaryId : null;
  const popupCoordinates = selectedBoundaryId && popupSelection?.id === selectedBoundaryId
    ? popupSelection.coordinates
    : null;
  const selectionState = boundarySelectionState({
    requestedId: effectiveBoundaryId,
    feature: selectedFeature,
    lookup: lookupStatus,
    openedOnMap: popupCoordinates !== null,
  });

  const loadedAt = query.dataUpdatedAt ?? 0;
  const inspectors = useMemo(() => fieldMapInspectors(data?.features ?? []), [data]);
  // A map opened by number or focused by case stays visible even when the filters would hide it.
  const visible = useMemo(() => {
    if (!data) return undefined;
    // "Last N days" counts back from when the maps were last loaded.
    const matching = filterFieldMaps(data.features, filters, loadedAt);
    const matchingSet = new Set(matching.map((feature) => String(feature.properties.id)));
    const kept = data.features.filter((feature) => {
      const id = String(feature.properties.id);
      if (matchingSet.has(id)) return true;
      if (loadedFeature && feature === loadedFeature) return true;
      return casePlotIdSet.has(id);
    });
    return { ...data, features: kept };
  }, [data, filters, loadedAt, loadedFeature, casePlotIdSet]);

  const mapData = useMemo(() => {
    if (!visible) return undefined;
    const extras: FieldSurveyBoundaryFeature[] = [...caseExtraSurveys.features];
    if (selectedFeature && !loadedFeature) extras.push(selectedFeature);
    if (extras.length === 0) return visible;
    return { ...visible, features: dedupeFeatures([...visible.features, ...extras]) };
  }, [visible, caseExtraSurveys.features, selectedFeature, loadedFeature]);

  const focusedCaseLocation = useMemo<FocusedCaseLocation | null>(() => {
    if (!focusedReport || focusedReport.locationUnavailable) return null;
    if (
      typeof focusedReport.finalLatitude !== "number"
      || !Number.isFinite(focusedReport.finalLatitude)
      || typeof focusedReport.finalLongitude !== "number"
      || !Number.isFinite(focusedReport.finalLongitude)
    ) {
      return null;
    }
    return {
      longitude: focusedReport.finalLongitude,
      latitude: focusedReport.finalLatitude,
      referenceCode: focusedReport.referenceCode,
    };
  }, [focusedReport]);

  const currentUrl = `${location.pathname}${location.search}` || `${routes.monitoring}?view=boundaries`;
  const currentReturnContext = useMemo(
    () => createReturnContext(currentUrl, "Field maps"),
    [currentUrl],
  );

  const stateReturn = readReturnContext(location.state);
  const backTarget = reportParam
    ? stateReturn
      ? {
          to: stateReturn.to,
          label: stateReturn.label.replace(/^Back to\s+/i, ""),
        }
      : {
          to: routes.reportDetail(reportParam),
          label: focusedReport ? `Case ${focusedReport.referenceCode}` : "Case",
        }
    : null;

  const updateFilters = (nextFilters: Filters) => {
    setSearchParams(writeFieldMapFilters(searchParams, nextFilters));
  };

  const updateBoundaryParam = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("boundary", id);
    else next.delete("boundary");
    setSearchParams(next, { replace: true });
  };

  const selectFromList = (id: string) => {
    setDismissedAutoSelectReport(null);
    setPopupSelection(null);
    updateBoundaryParam(id);
  };

  const selectFromMap = (id: string, coordinates: FieldSurveyPosition) => {
    setDismissedAutoSelectReport(null);
    setPopupSelection({ id, coordinates });
    updateBoundaryParam(id);
  };

  const clearSelection = () => {
    setPopupSelection(null);
    if (reportParam) setDismissedAutoSelectReport(reportParam);
    updateBoundaryParam(null);
  };

  const clearCaseFocus = () => {
    setDismissedAutoSelectReport(null);
    const next = new URLSearchParams(searchParams);
    next.delete("report");
    setSearchParams(next);
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
      <WorkspaceFreshness
        updatedAt={cannotDisplayCachedData ? undefined : query.dataUpdatedAt}
        fetching={query.isFetching && Boolean(data)}
        refreshFailed={Boolean(query.isRefetchError) && hasCachedData && !cannotDisplayCachedData}
        onRetry={() => void query.refetch()}
      />
      {reportParam ? (
        <section className="case-context-strip" aria-label="Focused case context">
          <div className="case-context-strip__top">
            <div className="case-context-strip__nav">
              {backTarget ? (
                <Link className="case-context-strip__back" to={backTarget.to}>
                  <ArrowLeft aria-hidden="true" />
                  <span>Back to {backTarget.label}</span>
                </Link>
              ) : null}
              {focusedReport ? (
                <div className="case-context-strip__identity">
                  <strong className="case-context-strip__ref">{focusedReport.referenceCode}</strong>
                  <span className="case-context-strip__barangay">{focusedReport.barangay}</span>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="quiet" onClick={clearCaseFocus}>
              Clear case focus
            </Button>
          </div>
          {reportQuery.isPending && !focusedReport ? (
            <p className="case-context-strip__loading" role="status">Loading case context...</p>
          ) : null}
          {reportQuery.isError && !focusedReport ? (
            <p className="case-context-strip__error" role="alert">
              {caseContextErrorMessage(reportQuery.error)}
            </p>
          ) : null}
          {caseSummary?.pendingSync ? (
            <p className="case-context-strip__status" role="status">
              The inspector&apos;s field map is still on their phone. It appears here once it syncs.
            </p>
          ) : caseSummary?.state === "none" ? (
            <p className="case-context-strip__status" role="status">
              No field map linked to this case yet.
            </p>
          ) : null}
          {caseSummary?.newerWaitingPlot ? (
            <p className="case-context-strip__callout" role="status">
              Newer measurement waiting for confirmation
            </p>
          ) : null}
          {caseSummary && caseSummary.plots.length > 1 ? (
            <div className="case-context-strip__plots" role="group" aria-label="Case field map plots">
              {caseSummary.plots.map((plot) => {
                const plotId = String(plot.fieldSurveyId);
                const isLatest = plot.fieldSurveyId === caseSummary.latestBoundaryId;
                const isSelected = effectiveBoundaryId === plotId;
                const plotName = plot.label || `Map ${plot.fieldSurveyId}`;
                return (
                  <button
                    key={plotId}
                    type="button"
                    className="case-context-strip__plot-btn"
                    aria-pressed={isSelected}
                    onClick={() => selectFromList(plotId)}
                  >
                    <span className="case-context-strip__plot-name">{plotName}</span>
                    {isLatest ? (
                      <span className="field-map-badge field-map-badge--latest">Latest</span>
                    ) : null}
                    <time className="case-context-strip__plot-time" dateTime={plot.capturedAt}>
                      {formatDateTime(plot.capturedAt)}
                    </time>
                    <span className={`field-map-badge field-map-badge--${plot.status}`}>
                      {plot.status === "confirmed" ? "Confirmed" : "Waiting"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
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
      {selectionState === "missing" && !caseSummary?.pendingSync ? (
        <p className="queue-refresh-status" role="status">
          Boundary {effectiveBoundaryId} was not found.
        </p>
      ) : null}
      {selectionState === "unavailable" ? (
        <p className="queue-refresh-warning" role="alert">
          Boundary {effectiveBoundaryId} could not be loaded. Try again in a moment.
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
            onChange={updateFilters}
          />
          <BoundariesMap
            data={mapData ?? data}
            selectedBoundaryId={selectedBoundaryId}
            popupCoordinates={popupCoordinates}
            highlightedBoundaryIds={casePlotIds}
            focusedCaseLocation={focusedCaseLocation}
            returnContext={currentReturnContext}
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
            returnContext={currentReturnContext}
          />
        </div>
      ) : null}
    </PageContent>
  );
}
