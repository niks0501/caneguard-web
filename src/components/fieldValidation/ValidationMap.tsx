import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Layer,
  Map,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { FieldValidationMapData, FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import type { ReviewStatus } from "../../domain/report.types";
import { routes } from "../../app/routes";
import { formatValidationDate } from "./fieldValidation.format";
import { env } from "../../config/env";

import "maplibre-gl/dist/maplibre-gl.css";

const mapTilerStyle = env.mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(env.mapTilerKey)}`
  : undefined;

const NASUGBU_VIEW = {
  longitude: 120.63,
  latitude: 14.07,
  zoom: 10,
} as const;

type MapProviderState = "loading" | "ready" | "error";

const statusColorExpression = [
  "match",
  ["get", "review_status"],
  "verified_by_staff",
  "#2f855a",
  "unable_to_verify",
  "#64748b",
  "resolved",
  "#94a3a8",
  "#bf8324",
] as ExpressionSpecification;

const statusSymbolExpression = [
  "match",
  ["get", "review_status"],
  "verified_by_staff",
  "✓",
  "unable_to_verify",
  "?",
  "resolved",
  "•",
  "!",
] as ExpressionSpecification;

const pointFilter: FilterSpecification = ["!", ["has", "point_count"]];

function statusLabel(status: ReviewStatus) {
  return reviewStatusLabels[status];
}

function MapLegend() {
  const entries: Array<{ status: ReviewStatus; marker: string }> = [
    { status: "submitted_unverified", marker: "!" },
    { status: "for_field_validation", marker: "!" },
    { status: "verified_by_staff", marker: "✓" },
    { status: "unable_to_verify", marker: "?" },
    { status: "resolved", marker: "•" },
  ];

  return (
    <div className="validation-map__legend" aria-label="Review state legend">
      <p className="eyebrow">Review state</p>
      <ul>
        {entries.map(({ status, marker }) => (
          <li key={status}>
            <span className={`map-marker map-marker--${status}`} aria-hidden="true">{marker}</span>
            <span>{statusLabel(status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PointPopup({
  feature,
  coordinates,
  onClose,
}: {
  feature: FieldValidationMapFeature;
  coordinates: [number, number];
  onClose: () => void;
}) {
  const properties = feature.properties;
  return (
    <Popup
      longitude={coordinates[0]}
      latitude={coordinates[1]}
      closeButton
      closeOnClick={false}
      onClose={onClose}
      anchor="bottom"
      maxWidth="320px"
    >
      <div className="validation-map__popup">
        <p className="eyebrow">Submitted observation</p>
        <h3>{properties.referenceCode}</h3>
        <dl>
          <div><dt>Review state</dt><dd>{statusLabel(properties.reviewStatus)}</dd></div>
          <div><dt>Possible result</dt><dd>{diseaseLabels[properties.predictedDisease]}</dd></div>
          <div><dt>Barangay</dt><dd>{properties.barangay}</dd></div>
          <div><dt>Observed</dt><dd>{formatValidationDate(properties.observedAt)}</dd></div>
          <div><dt>Location</dt><dd>{properties.locationSource === "gps" ? "GPS" : properties.locationSource === "manual_map" ? "Manual map" : "Not provided"}</dd></div>
        </dl>
        <Link className="button button--primary" to={routes.reportDetail(properties.uuid)}>
          Open Report
        </Link>
      </div>
    </Popup>
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
        <strong>Map provider is unavailable.</strong>
        <p>The report table and validation queue remain available.</p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="validation-map__provider-status" role="status">
        <strong>Loading map provider...</strong>
        <p>Report locations and the accessible table remain available while the basemap loads.</p>
      </div>
    );
  }

  return (
    <div className="validation-map__provider-status" role="status">
      <strong>{hasMatchingReports ? "No located reports to plot." : "No reports match these filters."}</strong>
      <p>
        {hasMatchingReports
          ? "Reports exist, but none have a valid coordinate pair. They remain available in the report table and validation queue."
          : "Try changing or clearing the applied filters."}
      </p>
    </div>
  );
}

export function ValidationMap({
  data,
  frameKey = "default",
  isPlaceholderData = false,
}: {
  data: FieldValidationMapData;
  frameKey?: string;
  isPlaceholderData?: boolean;
}) {
  const [selected, setSelected] = useState<{
    feature: FieldValidationMapFeature;
    coordinates: [number, number];
  } | null>(null);
  const [providerState, setProviderState] = useState<MapProviderState>("loading");
  const mapRef = useRef<MapRef | null>(null);
  const fittedFrameKey = useRef<string | null>(null);
  const sourceData = {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
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
      map.easeTo({
        center: [NASUGBU_VIEW.longitude, NASUGBU_VIEW.latitude],
        zoom: NASUGBU_VIEW.zoom,
      });
    } else if (data.features.length === 1) {
      const [longitude, latitude] = data.features[0].geometry.coordinates;
      map.easeTo({ center: [longitude, latitude], zoom: 13 });
    } else {
      const bounds = data.features.reduce(
        (currentBounds, feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          return [
            [
              Math.min(currentBounds[0][0], longitude),
              Math.min(currentBounds[0][1], latitude),
            ],
            [
              Math.max(currentBounds[1][0], longitude),
              Math.max(currentBounds[1][1], latitude),
            ],
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

  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (feature.properties?.point_count) {
      const clusterId = Number(feature.properties.cluster_id);
      const map = event.target as unknown as MapRef;
      const source = map.getSource("validation-reports") as {
        getClusterExpansionZoom?: (
          id: number,
          callback: (error: Error | null, zoom?: number) => void,
        ) => void;
      } | undefined;
      source?.getClusterExpansionZoom?.(clusterId, (error, zoom) => {
        if (error || zoom === undefined) return;
        map.easeTo({ center: event.lngLat, zoom });
      });
      return;
    }

    const matchingFeature = data.features.find(
      (item) => item.properties.uuid === feature.properties?.uuid,
    );
    if (matchingFeature) {
      setSelected({
        feature: matchingFeature,
        coordinates: [event.lngLat.lng, event.lngLat.lat],
      });
    }
  };

  return (
    <div className="validation-map-card">
      <div className="validation-map-card__heading">
        <div>
          <p className="eyebrow">Spatial index</p>
          <h2 id="validation-map-heading">Report locations</h2>
        </div>
        <span>{data.metadata.locatedCount} located</span>
      </div>
      <div className="validation-map" aria-label="Map of submitted report locations">
        {mapTilerStyle ? (
          <>
            <Map
            ref={mapRef}
            initialViewState={NASUGBU_VIEW}
            mapStyle={mapTilerStyle}
            interactiveLayerIds={["validation-clusters", "validation-points"]}
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
              clusterMaxZoom={14}
              clusterRadius={48}
            >
              <Layer
                id="validation-clusters"
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": "#54745d",
                  "circle-opacity": 0.92,
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    18,
                    10,
                    24,
                    50,
                    31,
                  ],
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
                  "circle-opacity": [
                    "match",
                    ["get", "review_status"],
                    "verified_by_staff",
                    0.95,
                    "resolved",
                    0.6,
                    0,
                  ],
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
            {selected ? (
              <PointPopup
                feature={selected.feature}
                coordinates={selected.coordinates}
                onClose={() => setSelected(null)}
              />
            ) : null}
            </Map>
            <MapProviderStatus
              state={providerState}
              hasLocatedReports={data.features.length > 0}
              hasMatchingReports={data.metadata.totalCount > 0}
            />
          </>
        ) : (
          <div className="validation-map__unavailable" role="status">
            <strong>Map provider is not configured.</strong>
            <p>The report table and validation queue remain available.</p>
          </div>
        )}
      </div>
      <MapLegend />
    </div>
  );
}
