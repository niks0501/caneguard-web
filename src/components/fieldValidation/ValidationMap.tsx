import { useEffect, useRef, useState } from "react";
import {
  Layer,
  Map,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource } from "maplibre-gl";
import { LOCATION_MAP_MAX_ZOOM, locationGroupKey, locationGroupMembers, radialLocationOffsets } from "./locationGroups";
import type { FieldValidationMapData, FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { reviewStatusLabels } from "../../domain/report.metadata";
import type { ReviewStatus } from "../../domain/report.types";
import { env } from "../../config/env";
import { resolveBasemapStyle } from "./localBasemap";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * CaneGuard's operating area replaces the superseded world-level fallback so
 * the interface never implies coverage outside the study area.
 */
const OPERATING_AREA_VIEW = {
  longitude: 120.65,
  latitude: 14.09,
  zoom: 9,
} as const;

type MapProviderState = "loading" | "ready" | "error";

const statusColorExpression = [
  "match",
  ["get", "review_status"],
  "verified_by_staff",
  "#2d6b40",
  "unable_to_verify",
  "#4d5c52",
  "resolved",
  "#98aba0",
  "#6e5213",
] as ExpressionSpecification;

/**
 * Every operational state carries its own glyph so meaning never depends on
 * colour alone and distinct states are not shown as identical markers.
 */
const statusSymbolExpression = [
  "match",
  ["get", "review_status"],
  "submitted_unverified",
  "○",
  "for_field_validation",
  "!",
  "verified_by_staff",
  "✓",
  "unable_to_verify",
  "?",
  "resolved",
  "•",
  "!",
] as ExpressionSpecification;

const pointFilter: FilterSpecification = ["!", ["has", "point_count"]];

export interface ValidationMapSelection {
  kind: "case" | "cluster";
  caseUuid?: string | null;
  clusterKeys?: string[];
  coordinates: [number, number];
}

function MapLegend() {
  const entries: Array<{ status: ReviewStatus; marker: string }> = [
    { status: "submitted_unverified", marker: "○" },
    { status: "for_field_validation", marker: "!" },
    { status: "verified_by_staff", marker: "✓" },
    { status: "unable_to_verify", marker: "?" },
    { status: "resolved", marker: "•" },
  ];

  return (
    <div className="validation-map__legend" aria-label="Case status legend">
      <p className="map-legend__title">Case Status</p>
      <ul>
        {entries.map(({ status, marker }) => (
          <li key={status}>
            <span className={`map-marker map-marker--${status}`} aria-hidden="true">{marker}</span>
            <span>{reviewStatusLabels[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapProviderStatus({
  state,
  hasLocatedReports,
  hasMatchingReports,
}: {
  state: MapProviderState;
  hasLocatedReports: boolean;
  hasMatchingReports: boolean;
}) {
  if (state === "ready" && hasLocatedReports) return null;

  if (state === "error") {
    return (
      <div className="validation-map__provider-status validation-map__provider-status--error" role="alert">
        <strong>Map unavailable.</strong>
        <p>Case information and Reports Without Location remain available.</p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="validation-map__provider-status" role="status">
        <strong>Loading map...</strong>
        <p>Case information remains available while the basemap loads.</p>
      </div>
    );
  }

  return (
    <div className="validation-map__provider-status" role="status">
      <strong>{hasMatchingReports ? "No located cases" : "No matching cases"}</strong>
      <p>
        {hasMatchingReports
          ? "Matching cases exist, but none has a usable coordinate pair. They remain accessible through Reports Without Location."
          : "Try changing or clearing the applied filters."}
      </p>
    </div>
  );
}

export function ValidationMap({
  data,
  frameKey = "default",
  isPlaceholderData = false,
  selection = null,
  onSelect,
  onClearSelection,
}: {
  data: FieldValidationMapData;
  frameKey?: string;
  isPlaceholderData?: boolean;
  selection?: ValidationMapSelection | null;
  onSelect?: (selection: ValidationMapSelection) => void;
  onClearSelection?: () => void;
}) {
  const [expanded, setExpanded] = useState<{ keys: string; features: FieldValidationMapFeature[] } | null>(null);
  const [clickError, setClickError] = useState(false);
  const clickSequence = useRef(0);
  const [providerState, setProviderState] = useState<MapProviderState>("loading");
  const mapRef = useRef<MapRef | null>(null);
  const fittedFrameKey = useRef<string | null>(null);
  // Resolved per render so tests and runtime configuration can both change the
  // basemap without reloading the module.
  const basemapStyle = resolveBasemapStyle(env.mapTilerKey, import.meta.env.DEV);

  const expandedFeatures = selection?.kind === "cluster" && expanded
    && expanded.keys === (selection.clusterKeys ?? []).join("|")
    ? expanded.features
    : [];

  const sourceData = {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.properties.locationGroupCoordinates ?? feature.geometry.coordinates,
      },
      properties: {
        uuid: feature.properties.uuid,
        review_status: feature.properties.reviewStatus,
      },
    })),
  };

  useEffect(() => {
    const map = mapRef.current;
    if (
      providerState !== "ready" ||
      !map ||
      isPlaceholderData ||
      fittedFrameKey.current === frameKey
    ) {
      return;
    }

    if (data.features.length === 0) {
      map.easeTo({ center: [OPERATING_AREA_VIEW.longitude, OPERATING_AREA_VIEW.latitude], zoom: OPERATING_AREA_VIEW.zoom });
    } else if (data.features.length === 1) {
      const [longitude, latitude] = data.features[0].geometry.coordinates;
      map.easeTo({ center: [longitude, latitude], zoom: 13 });
    } else {
      const bounds = data.features.reduce(
        (currentBounds, feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          return [
            [Math.min(currentBounds[0][0], longitude), Math.min(currentBounds[0][1], latitude)],
            [Math.max(currentBounds[1][0], longitude), Math.max(currentBounds[1][1], latitude)],
          ] as [[number, number], [number, number]];
        },
        [
          [...data.features[0].geometry.coordinates],
          [...data.features[0].geometry.coordinates],
        ] as [[number, number], [number, number]],
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }

    fittedFrameKey.current = frameKey;
  }, [data.features, frameKey, isPlaceholderData, providerState]);

  const handleMapLoad = (event: { target: unknown }) => {
    mapRef.current = event.target as MapRef;
    setProviderState("ready");
  };

  const handleClick = async (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      onClearSelection?.();
      return;
    }
    const sequence = ++clickSequence.current;
    setClickError(false);

    if (feature.properties?.point_count) {
      const map = event.target as unknown as MapRef;
      const source = map.getSource("validation-reports") as GeoJSONSource | undefined;
      if (!source) return;
      try {
        const clusterId = Number(feature.properties.cluster_id);
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (sequence !== clickSequence.current) return;
        if (zoom > map.getZoom() && zoom < LOCATION_MAP_MAX_ZOOM) {
          onClearSelection?.();
          map.easeTo({ center: event.lngLat, zoom });
          return;
        }
        const leaves = await source.getClusterLeaves(clusterId, data.features.length, 0);
        if (sequence !== clickSequence.current) return;
        const uuids = new Set(leaves.map((leaf) => leaf.properties?.uuid));
        const keys = [...new Set(data.features.filter((item) => uuids.has(item.properties.uuid)).map(locationGroupKey))].sort();
        const members = keys.flatMap((key) => locationGroupMembers(data.features, key));
        if (!members.length) return;
        // Fan the members into stable pixel offsets so the selected cluster
        // stays visually identifiable while its queue is reviewed.
        const center = map.project(event.lngLat);
        const offsets = radialLocationOffsets(members.length);
        setExpanded({
          keys: keys.join("|"),
          features: members.map((item, index) => {
            const point = map.unproject([center.x + offsets[index][0], center.y + offsets[index][1]]);
            return { ...item, geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] as [number, number] } };
          }),
        });
        onSelect?.({ kind: "cluster", clusterKeys: keys, coordinates: [event.lngLat.lng, event.lngLat.lat] });
      } catch {
        if (sequence === clickSequence.current) setClickError(true);
      }
      return;
    }

    const matchingFeature = data.features.find(
      (item) => item.properties.uuid === feature.properties?.uuid,
    );
    if (matchingFeature) {
      onSelect?.({
        kind: "case",
        caseUuid: matchingFeature.properties.uuid,
        coordinates: matchingFeature.properties.locationGroupCoordinates ?? matchingFeature.geometry.coordinates,
      });
    }
  };

  return (
    <div className="validation-map-card">
      <div className="validation-map-card__heading">
        <div>
          <h2 id="validation-map-heading">Cases</h2>
        </div>
        <span>{data.metadata.returnedCount} shown</span>
      </div>
      <div className="validation-map" aria-label="Map of submitted report locations">
        {basemapStyle ? (
          <>
            <Map
              ref={mapRef}
              initialViewState={OPERATING_AREA_VIEW}
              mapStyle={basemapStyle}
              maxZoom={LOCATION_MAP_MAX_ZOOM}
              interactiveLayerIds={["validation-clusters", "validation-points", "validation-expanded-points"]}
              onClick={handleClick}
              onLoad={handleMapLoad}
              onError={() => setProviderState("error")}
              reuseMaps
            >
              <NavigationControl position="top-right" showCompass={false} />
              <Source
                id="validation-reports"
                type="geojson"
                data={sourceData}
                cluster
                maxzoom={24}
                clusterMaxZoom={LOCATION_MAP_MAX_ZOOM}
                clusterRadius={48}
              >
                <Layer
                  id="validation-clusters"
                  type="circle"
                  filter={["has", "point_count"]}
                  paint={{
                    "circle-color": "#54745d",
                    "circle-opacity": 0.92,
                    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 31],
                    "circle-stroke-color": "#ffffff",
                    "circle-stroke-width": 2,
                  }}
                />
                <Layer
                  id="validation-cluster-count"
                  type="symbol"
                  filter={["has", "point_count"]}
                  layout={{
                    "text-field": ["get", "point_count_abbreviated"],
                    "text-size": 12,
                    "text-allow-overlap": true,
                  }}
                  paint={{ "text-color": "#ffffff" }}
                />
                <Layer
                  id="validation-points"
                  type="circle"
                  filter={pointFilter}
                  paint={{
                    "circle-color": statusColorExpression,
                    "circle-opacity": ["match", ["get", "review_status"], "verified_by_staff", 0.95, "resolved", 0.6, 0],
                    "circle-radius": 9,
                    "circle-stroke-color": statusColorExpression,
                    "circle-stroke-opacity": 1,
                    "circle-stroke-width": 3,
                  }}
                />
                <Layer
                  id="validation-point-symbol"
                  type="symbol"
                  filter={pointFilter}
                  layout={{
                    "text-field": statusSymbolExpression,
                    "text-size": 12,
                    "text-allow-overlap": true,
                  }}
                  paint={{ "text-color": statusColorExpression }}
                />
              </Source>
              <Source id="validation-expanded" type="geojson" data={{
                type: "FeatureCollection",
                features: expandedFeatures.map((item) => ({
                  ...item,
                  properties: { uuid: item.properties.uuid, review_status: item.properties.reviewStatus },
                })),
              }}>
                <Layer id="validation-expanded-points" type="circle" paint={{
                  "circle-color": statusColorExpression,
                  "circle-radius": 7,
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 2,
                }} />
              </Source>
              {selection?.kind === "case" ? (
                <Source id="validation-selected" type="geojson" data={{
                  type: "FeatureCollection",
                  features: [{
                    type: "Feature" as const,
                    geometry: { type: "Point" as const, coordinates: selection.coordinates },
                    properties: {},
                  }],
                }}>
                  <Layer id="validation-selected-ring" type="circle" paint={{
                    "circle-color": "#1f3d2b",
                    "circle-opacity": 0.25,
                    "circle-radius": 16,
                    "circle-stroke-color": "#1f3d2b",
                    "circle-stroke-width": 3,
                  }} />
                </Source>
              ) : null}
            </Map>
            <MapProviderStatus
              state={providerState}
              hasLocatedReports={data.features.length > 0}
              hasMatchingReports={data.metadata.totalCount > 0}
            />
          </>
        ) : (
          <div className="validation-map__unavailable" role="alert">
            <strong>Map unavailable.</strong>
            <p>Case information and Reports Without Location remain available.</p>
          </div>
        )}
      </div>
      {clickError ? <p role="status">This area could not be expanded. Open cases from Reports Without Location or View all cases.</p> : null}
      <MapLegend />
    </div>
  );
}
