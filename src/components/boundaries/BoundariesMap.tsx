import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map, Marker, NavigationControl, Popup, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import "../../lib/mapLibreWorker";
import { Link } from "react-router";
import { X } from "lucide-react";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature, FieldSurveyPosition } from "../../domain/fieldSurvey.types";
import { formatAffectedArea, formatDateTime } from "../../lib/formatters";
import { env } from "../../config/env";
import { routes } from "../../app/routes";
import { useMapPaint } from "../../theme/mapTheme";
import { useTheme } from "../../theme/useTheme";
import { resolveBasemapStyle } from "../fieldValidation/localBasemap";
import { createReturnContext, withReturnContext, type MapReturnContext } from "../navigation/mapNavigationContext";
import { boundaryCentroid } from "../reports/boundaryShape";
import { sortPlotsNewestFirst, supersedingPlotIds } from "./fieldMapFreshness";
import { FIELD_MAP_STATUS_LABEL, fieldMapName, fieldMapStatus, percentAffected, type FieldMapStatus } from "./fieldMapStatus";

import "maplibre-gl/dist/maplibre-gl.css";

const OPERATING_AREA_VIEW = {
  longitude: 120.65,
  latitude: 14.09,
  zoom: 9,
} as const;

/** Size and case labels stay off until the map is close enough to read them. */
const LABEL_MIN_ZOOM = 12;

type MapProviderState = "loading" | "ready" | "error";
type Bounds = [[number, number], [number, number]];

function boundsForFeatures(features: FieldSurveyBoundaryFeature[]): Bounds | null {
  const positions = features.flatMap((feature) => feature.geometry.coordinates.flat());
  if (positions.length === 0) return null;

  return positions.reduce(
    (bounds, [longitude, latitude]) => [
      [Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)],
      [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)],
    ] as Bounds,
    [[positions[0][0], positions[0][1]], [positions[0][0], positions[0][1]]] as Bounds,
  );
}

function boundsCenter(feature: FieldSurveyBoundaryFeature): FieldSurveyPosition {
  const bounds = boundsForFeatures([feature]);
  if (!bounds) return [OPERATING_AREA_VIEW.longitude, OPERATING_AREA_VIEW.latitude];
  return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
}

function MapProviderStatus({
  state,
  transientError,
  onRetry,
}: {
  state: MapProviderState;
  transientError: boolean;
  onRetry: () => void;
}) {
  if (state === "ready") {
    if (!transientError) return null;
    return (
      <div className="validation-map__provider-status boundaries-map__transient-status">
        <div role="status">
          <strong>Map tiles are temporarily unavailable.</strong>
          <p>The map remains interactive.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={onRetry}>Retry map</button>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="validation-map__provider-status validation-map__provider-status--error">
        <div role="alert">
          <strong>Map unavailable.</strong>
          <p>Field maps remain available in the list.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={onRetry}>Retry map</button>
      </div>
    );
  }
  return (
    <div className="validation-map__provider-status" role="status">
      <strong>Loading map...</strong>
      <p>The list remains available while the basemap loads.</p>
    </div>
  );
}

function boundaryLabel(feature: FieldSurveyBoundaryFeature) {
  const { areaSqm, cases } = feature.properties;
  const size = formatAffectedArea(areaSqm / 10_000);
  return {
    size,
    cases: cases.length,
    text: `${fieldMapName(feature)} · ${size}`,
  };
}

function BoundaryLegend() {
  return (
    <div className="validation-map__legend boundaries-map__legend" role="group" aria-label="Field map legend">
      <ul>
        <li><span className="boundaries-map__swatch" aria-hidden="true" /><span>{FIELD_MAP_STATUS_LABEL.confirmed}</span></li>
        <li><span className="boundaries-map__swatch boundaries-map__swatch--waiting" aria-hidden="true" /><span>{FIELD_MAP_STATUS_LABEL.waiting}</span></li>
        <li><span className="boundaries-map__swatch boundaries-map__swatch--unlinked" aria-hidden="true" /><span>{FIELD_MAP_STATUS_LABEL.unlinked}</span></li>
        <li><span className="boundaries-map__swatch boundaries-map__swatch--damage" aria-hidden="true" /><span>Damage area</span></li>
        <li><span className="boundaries-map__swatch boundaries-map__swatch--selected" aria-hidden="true" /><span>Selected map</span></li>
      </ul>
    </div>
  );
}

export interface FocusedCaseLocation {
  longitude: number;
  latitude: number;
  referenceCode: string;
}

const COMPACT_STATUS_LABEL: Record<FieldMapStatus, string> = {
  confirmed: "Confirmed",
  waiting: "Waiting",
  unlinked: "Not on a case",
};

export function BoundariesMap({
  data,
  selectedBoundaryId = null,
  popupCoordinates = null,
  highlightedBoundaryIds = [],
  focusedCaseLocation = null,
  returnContext,
  onSelect,
  onClearSelection,
}: {
  data: FieldSurveyBoundariesData;
  selectedBoundaryId?: string | null;
  popupCoordinates?: FieldSurveyPosition | null;
  highlightedBoundaryIds?: string[];
  focusedCaseLocation?: FocusedCaseLocation | null;
  returnContext?: MapReturnContext;
  onSelect?: (boundaryId: string, coordinates: FieldSurveyPosition) => void;
  onClearSelection?: () => void;
}) {
  const [providerState, setProviderState] = useState<MapProviderState>("loading");
  const [transientError, setTransientError] = useState(false);
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [zoom, setZoom] = useState<number>(OPERATING_AREA_VIEW.zoom);
  const [overlapState, setOverlapState] = useState<{ ids: string[]; coordinates: FieldSurveyPosition } | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const hasLoadedMap = useRef(false);
  const hasFittedInitialData = useRef(false);
  const lastFittedSelection = useRef<string | null>(null);
  const lastFocusedLocation = useRef<string | null>(null);
  // The basemap and the polygon paints follow the appearance tokens, so a dark
  // map is a real dark map rather than dimmed paper, and its boundaries stay
  // legible on that ground.
  const theme = useTheme();
  const paint = useMapPaint();
  const basemapStyle = resolveBasemapStyle(env.mapTilerKey, import.meta.env.DEV, theme);
  const sourceData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: data.features.map((feature) => ({
      ...feature,
      properties: { boundary_id: String(feature.properties.id), status: fieldMapStatus(feature) },
    })),
  }), [data.features]);
  const damageData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: data.features.flatMap((feature) => feature.properties.affectedAreas.map((geometry) => ({
      type: "Feature" as const,
      geometry,
      properties: { boundary_id: String(feature.properties.id) },
    }))),
  }), [data.features]);
  const highlightedSource = useMemo(() => {
    const highlightedSet = new Set(highlightedBoundaryIds);
    return {
      type: "FeatureCollection" as const,
      features: data.features
        .filter((feature) => {
          const id = String(feature.properties.id);
          return highlightedSet.has(id) && id !== selectedBoundaryId;
        })
        .map((feature) => ({ ...feature, properties: { boundary_id: String(feature.properties.id) } })),
    };
  }, [data.features, highlightedBoundaryIds, selectedBoundaryId]);
  const selectedFeature = selectedBoundaryId
    ? data.features.find((feature) => String(feature.properties.id) === selectedBoundaryId) ?? null
    : null;
  const selectedSource = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: selectedFeature
      ? [{ ...selectedFeature, properties: { boundary_id: String(selectedFeature.properties.id) } }]
      : [],
  }), [selectedFeature]);
  const supersedingByPlotId = useMemo(
    () => supersedingPlotIds(
      data.features.map((feature) => ({
        id: feature.properties.id,
        capturedAt: feature.properties.capturedAt,
        outlineFromSurveyId: feature.properties.outlineFromSurveyId,
      })),
    ),
    [data.features],
  );
  const overlappingFeatures = useMemo(() => {
    if (!overlapState || !selectedBoundaryId || !overlapState.ids.includes(selectedBoundaryId)) return [];
    const byId = new globalThis.Map(data.features.map((feature) => [String(feature.properties.id), feature]));
    const resolved = overlapState.ids
      .map((id) => byId.get(id))
      .filter((feature): feature is FieldSurveyBoundaryFeature => Boolean(feature));
    return resolved.length >= 2 ? resolved : [];
  }, [data.features, overlapState, selectedBoundaryId]);
  const popupPosition = selectedFeature
    ? popupCoordinates ?? (overlappingFeatures.length >= 2 && overlapState ? overlapState.coordinates : boundsCenter(selectedFeature))
    : null;
  const linkState = withReturnContext(
    returnContext ?? createReturnContext(`${routes.monitoring}?view=boundaries`, "Field maps"),
  );

  useEffect(() => {
    const map = mapRef.current;
    if (providerState !== "ready" || !map || hasFittedInitialData.current) return;

    const bounds = boundsForFeatures(data.features);
    if (bounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    } else if (!focusedCaseLocation) {
      map.easeTo({ center: [OPERATING_AREA_VIEW.longitude, OPERATING_AREA_VIEW.latitude], zoom: OPERATING_AREA_VIEW.zoom });
    }
    hasFittedInitialData.current = true;
  }, [data.features, focusedCaseLocation, providerState]);

  useEffect(() => {
    const map = mapRef.current;
    if (providerState !== "ready" || !map) return;
    if (!selectedFeature || !selectedBoundaryId) {
      lastFittedSelection.current = null;
      return;
    }
    if (lastFittedSelection.current === selectedBoundaryId) return;

    const bounds = boundsForFeatures([selectedFeature]);
    if (bounds) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      lastFittedSelection.current = selectedBoundaryId;
    }
  }, [providerState, selectedBoundaryId, selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (providerState !== "ready" || !map) return;
    if (selectedFeature || highlightedBoundaryIds.length > 0 || !focusedCaseLocation) {
      if (!focusedCaseLocation) lastFocusedLocation.current = null;
      return;
    }
    const key = `${focusedCaseLocation.referenceCode}:${focusedCaseLocation.longitude}:${focusedCaseLocation.latitude}`;
    if (lastFocusedLocation.current === key) return;

    map.easeTo({
      center: [focusedCaseLocation.longitude, focusedCaseLocation.latitude],
      zoom: 15,
    });
    lastFocusedLocation.current = key;
  }, [focusedCaseLocation, highlightedBoundaryIds.length, providerState, selectedFeature]);

  const handleMapLoad = (event: { target: unknown }) => {
    mapRef.current = event.target as MapRef;
    hasLoadedMap.current = true;
    setTransientError(false);
    setProviderState("ready");
  };

  const handleMapError = () => {
    if (hasLoadedMap.current) {
      setTransientError(true);
      return;
    }
    setProviderState("error");
  };

  // MapLibre reports a basemap source's metadata as `sourceDataType: "content"`
  // and a settled `idle` even when tiles failed, so only a real tile event from
  // a non-boundary source proves recovery and clears the transient notice.
  const handleSourceData = (event: { sourceId?: string; tile?: unknown }) => {
    if (!hasLoadedMap.current || !event.tile || !event.sourceId) return;
    if (event.sourceId.startsWith("field-boundaries")) return;
    setTransientError(false);
  };

  const handleRetryMap = () => {
    hasLoadedMap.current = false;
    hasFittedInitialData.current = false;
    lastFittedSelection.current = null;
    lastFocusedLocation.current = null;
    mapRef.current = null;
    setZoom(OPERATING_AREA_VIEW.zoom);
    setTransientError(false);
    setProviderState("loading");
    setMapInstanceKey((key) => key + 1);
  };

  const handleClear = () => {
    setOverlapState(null);
    onClearSelection?.();
  };

  const handleClick = (event: MapLayerMouseEvent) => {
    const clickedIds = new Set<string>();
    for (const item of event.features ?? []) {
      const rawId = item?.properties?.boundary_id;
      if (rawId !== undefined && rawId !== null) {
        clickedIds.add(String(rawId));
      }
    }
    if (clickedIds.size === 0) {
      handleClear();
      return;
    }

    const coordinates: FieldSurveyPosition = [event.lngLat.lng, event.lngLat.lat];
    const matchingFeatures = data.features.filter((feature) => clickedIds.has(String(feature.properties.id)));
    const sorted = sortPlotsNewestFirst(
      matchingFeatures.map((feature) => ({
        id: feature.properties.id,
        capturedAt: feature.properties.capturedAt,
        outlineFromSurveyId: feature.properties.outlineFromSurveyId,
      })),
    );

    if (sorted.length >= 2) {
      const orderedIds = sorted.map((item) => String(item.id));
      setOverlapState({ ids: orderedIds, coordinates });
      onSelect?.(orderedIds[0], coordinates);
      return;
    }

    setOverlapState(null);
    const firstId = sorted[0] ? String(sorted[0].id) : [...clickedIds][0];
    onSelect?.(firstId, coordinates);
  };

  return (
    <section className="validation-map-card boundaries-map-card" aria-labelledby="boundaries-map-heading">
      <div className="validation-map-card__heading">
        <h2 id="boundaries-map-heading">Field map</h2>
        <span>{data.features.length} shown</span>
      </div>
      <div className="validation-map boundaries-map" role="region" aria-label="Map of recorded field maps">
        {basemapStyle ? (
          <>
            <Map
              key={mapInstanceKey}
              ref={mapRef}
              initialViewState={OPERATING_AREA_VIEW}
              mapStyle={basemapStyle}
              interactiveLayerIds={["field-boundaries-fill", "field-boundaries-outline", "field-boundaries-outline-unlinked", "field-boundaries-damage-fill"]}
              onClick={handleClick}
              onLoad={handleMapLoad}
              onError={handleMapError}
              onSourceData={handleSourceData}
              onZoomEnd={(event) => setZoom(event.viewState.zoom)}
            >
              <NavigationControl position="top-right" showCompass={false} />
              <Source id="field-boundaries" type="geojson" data={sourceData}>
                <Layer
                  id="field-boundaries-fill"
                  type="fill"
                  paint={{
                    "fill-color": ["match", ["get", "status"],
                      "confirmed", paint.boundaryFill,
                      "waiting", paint.boundaryWaiting,
                      paint.boundaryUnlinked],
                    "fill-opacity": 0.22,
                  }}
                />
                <Layer
                  id="field-boundaries-outline"
                  type="line"
                  filter={["!=", ["get", "status"], "unlinked"]}
                  paint={{
                    "line-color": ["match", ["get", "status"], "waiting", paint.boundaryWaitingLine, paint.boundaryLine],
                    "line-width": 2,
                  }}
                />
                <Layer
                  id="field-boundaries-outline-unlinked"
                  type="line"
                  filter={["==", ["get", "status"], "unlinked"]}
                  paint={{ "line-color": paint.boundaryUnlinked, "line-width": 2, "line-dasharray": [2, 2] }}
                />
              </Source>
              <Source id="field-boundaries-damage" type="geojson" data={damageData}>
                <Layer
                  id="field-boundaries-damage-fill"
                  type="fill"
                  paint={{ "fill-color": paint.boundaryDamage, "fill-opacity": 0.5 }}
                />
                <Layer
                  id="field-boundaries-damage-line"
                  type="line"
                  paint={{ "line-color": paint.boundaryDamage, "line-width": 1.5 }}
                />
              </Source>
              <Source id="field-boundaries-highlighted" type="geojson" data={highlightedSource}>
                <Layer
                  id="field-boundaries-highlighted-line"
                  type="line"
                  paint={{ "line-color": paint.boundarySelected, "line-width": 2, "line-dasharray": [3, 2] }}
                />
              </Source>
              <Source id="field-boundaries-selected" type="geojson" data={selectedSource}>
                <Layer
                  id="field-boundaries-selected-line"
                  type="line"
                  paint={{ "line-color": paint.boundarySelected, "line-width": 3 }}
                />
              </Source>
              {focusedCaseLocation ? (
                <Marker
                  longitude={focusedCaseLocation.longitude}
                  latitude={focusedCaseLocation.latitude}
                  anchor="center"
                >
                  <span
                    className="boundaries-map__case-pin"
                    style={{ backgroundColor: paint.ink, borderColor: paint.halo, color: paint.onPin }}
                    title={`Case ${focusedCaseLocation.referenceCode}`}
                    aria-label={`Case location ${focusedCaseLocation.referenceCode}`}
                    data-case-pin={focusedCaseLocation.referenceCode}
                  />
                </Marker>
              ) : null}
              {zoom >= LABEL_MIN_ZOOM ? data.features.map((feature) => {
                const centre = boundaryCentroid(feature.geometry);
                if (!centre) return null;
                const label = boundaryLabel(feature);
                return (
                  <Marker
                    key={feature.properties.id}
                    longitude={centre.longitude}
                    latitude={centre.latitude}
                    anchor="center"
                  >
                    <span
                      className={`boundaries-map__label${label.cases > 0 ? " boundaries-map__label--case" : ""}`}
                      data-boundary-label={feature.properties.id}
                    >
                      {label.text}
                    </span>
                  </Marker>
                );
              }) : null}
              {selectedFeature && popupPosition ? (() => {
                const reusedFromId = selectedFeature.properties.outlineFromSurveyId;
                const newerSurveyIds = supersedingByPlotId.get(selectedFeature.properties.id) ?? [];
                return (
                <Popup
                  longitude={popupPosition[0]}
                  latitude={popupPosition[1]}
                  anchor="top"
                  maxWidth="360px"
                  closeButton={false}
                  closeOnClick={false}
                  closeOnMove={false}
                  onClose={handleClear}
                >
                  <div className="boundaries-map__popup" role="dialog" aria-labelledby="boundary-popup-heading">
                    {overlappingFeatures.length >= 2 && overlapState ? (
                      <div className="boundaries-map__overlap" role="group" aria-label="Overlapping plots at this spot">
                        <p className="boundaries-map__overlap-title">
                          {overlappingFeatures.length} overlapping plots at this spot (newest first)
                        </p>
                        <div className="boundaries-map__overlap-list">
                          {overlappingFeatures.map((feature, index) => {
                            const id = String(feature.properties.id);
                            const status = fieldMapStatus(feature);
                            const isActive = id === selectedBoundaryId;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="boundaries-map__overlap-pill"
                                aria-pressed={isActive}
                                onClick={() => onSelect?.(id, overlapState.coordinates)}
                              >
                                <span className="boundaries-map__overlap-name">{fieldMapName(feature)}</span>
                                {index === 0 ? <span className="field-map-badge field-map-badge--latest">Latest</span> : null}
                                <time className="boundaries-map__overlap-time" dateTime={feature.properties.capturedAt}>
                                  {formatDateTime(feature.properties.capturedAt)}
                                </time>
                                <span className={`field-map-badge field-map-badge--${status}`}>
                                  {COMPACT_STATUS_LABEL[status]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <div className="boundaries-map__popup-heading">
                      <h3 id="boundary-popup-heading">{fieldMapName(selectedFeature)}</h3>
                      <button type="button" aria-label="Close field map details" onClick={handleClear}>
                        <X aria-hidden="true" />
                      </button>
                    </div>
                    <dl>
                      <div><dt>Status</dt><dd>{FIELD_MAP_STATUS_LABEL[fieldMapStatus(selectedFeature)]}</dd></div>
                      <div><dt>Captured</dt><dd>{formatDateTime(selectedFeature.properties.capturedAt)}</dd></div>
                      <div><dt>Area · device-reported</dt><dd>{formatAffectedArea(selectedFeature.properties.areaSqm / 10_000)}</dd></div>
                      {selectedFeature.properties.affectedAreas.length > 0 ? (
                        <div>
                          <dt>Damage · device-reported</dt>
                          <dd>
                            {selectedFeature.properties.affectedAreaSqm === null
                              ? `${selectedFeature.properties.affectedAreas.length} drawn`
                              : formatAffectedArea(selectedFeature.properties.affectedAreaSqm / 10_000)}
                          </dd>
                        </div>
                      ) : null}
                      {percentAffected(selectedFeature.properties.areaSqm, selectedFeature.properties.affectedAreaSqm) !== null ? (
                        <div>
                          <dt>% affected</dt>
                          <dd>{percentAffected(selectedFeature.properties.areaSqm, selectedFeature.properties.affectedAreaSqm)}%</dd>
                        </div>
                      ) : null}
                      <div><dt>Inspector</dt><dd>{selectedFeature.properties.inspector.name}</dd></div>
                      {selectedFeature.properties.cases.length > 0 ? (
                        <div>
                          <dt>Cases</dt>
                          <dd>
                            <ul className="boundaries-map__cases">
                              {selectedFeature.properties.cases.map((link) => (
                                <li key={link.uuid} className="boundaries-map__case-item">
                                  <div>
                                    <Link to={routes.reportDetail(link.uuid)} state={linkState}>{link.referenceCode}</Link>
                                    {link.link === "attached" ? " · attached" : " · confirmed"}
                                  </div>
                                  <Link
                                    className="boundaries-map__monitoring-link"
                                    to={routes.monitoringMapForReport(link.uuid)}
                                    state={linkState}
                                  >
                                    Show on Monitoring Map
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {(reusedFromId !== null && reusedFromId !== undefined) || newerSurveyIds.length > 0 ? (
                      <div className="boundaries-map__lineage">
                        {reusedFromId !== null && reusedFromId !== undefined ? (
                          <p>Reused plot outline from Map {reusedFromId}</p>
                        ) : null}
                        {newerSurveyIds.length > 0 ? (
                          <p>Newer survey exists: {newerSurveyIds.map((id) => `Map ${id}`).join(", ")}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Popup>
                );
              })() : null}
            </Map>
            <MapProviderStatus state={providerState} transientError={transientError} onRetry={handleRetryMap} />
          </>
        ) : (
          <div className="validation-map__unavailable" role="alert">
            <strong>Map unavailable.</strong>
            <p>Field maps remain available in the list.</p>
          </div>
        )}
      </div>
      <BoundaryLegend />
    </section>
  );
}
