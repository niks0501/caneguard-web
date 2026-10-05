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
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource } from "maplibre-gl";
import { LOCATION_MAP_MAX_ZOOM, locationGroupKey, locationGroupMembers, radialLocationOffsets } from "./locationGroups";
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

const WORLD_VIEW = {
  longitude: 0,
  latitude: 20,
  zoom: 1,
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
      <p className="map-legend__title">Review state</p>
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
  features,
  coordinates,
  truncated,
  onClose,
}: {
  features: FieldValidationMapFeature[];
  coordinates: [number, number];
  truncated: boolean;
  onClose: () => void;
}) {
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
        <h3>{features.length === 1 ? features[0].properties.referenceCode : `${features.length} reports at this location`}</h3>
        {truncated ? <p role="status">Within the returned map slice.</p> : null}
        <ul className="location-group-reports">
          {features.map(({ properties }) => (
            <li key={properties.uuid}>
              <Link to={routes.reportDetail(properties.uuid)}>{properties.referenceCode}</Link>
              <span>{statusLabel(properties.reviewStatus)}</span>
              <span>{diseaseLabels[properties.predictedDisease]} · {properties.barangay}</span>
              <time>{formatValidationDate(properties.observedAt)}</time>
            </li>
          ))}
        </ul>
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
    keys: string[];
    coordinates: [number, number];
  } | null>(null);
  const [expanded, setExpanded] = useState<{ input: FieldValidationMapFeature[]; features: FieldValidationMapFeature[] } | null>(null);
  const [clickError, setClickError] = useState(false);
  const clickSequence = useRef(0);
  const [providerState, setProviderState] = useState<MapProviderState>("loading");
  const mapRef = useRef<MapRef | null>(null);
  const fittedFrameKey = useRef<string | null>(null);
  useEffect(() => {
    const requests = clickSequence;
    requests.current++;
    return () => { requests.current++; };
  }, [data.features]);

  const sourceData = {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      geometry: { ...feature.geometry, coordinates: feature.properties.locationGroupCoordinates ?? feature.geometry.coordinates },
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
        center: [WORLD_VIEW.longitude, WORLD_VIEW.latitude],
        zoom: WORLD_VIEW.zoom,
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

  const handleClick = async (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
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
          setSelected(null);
          setExpanded(null);
          map.easeTo({ center: event.lngLat, zoom });
          return;
        }
        const leaves = await source.getClusterLeaves(clusterId, data.features.length, 0);
        if (sequence !== clickSequence.current) return;
        const uuids = new Set(leaves.map((leaf) => leaf.properties?.uuid));
        const keys = [...new Set(data.features.filter((item) => uuids.has(item.properties.uuid)).map(locationGroupKey))].sort();
        const members = keys.flatMap((key) => locationGroupMembers(data.features, key));
        if (!members.length) return;
        const center = map.project(event.lngLat);
        const offsets = radialLocationOffsets(members.length);
        setExpanded({
          input: data.features,
          features: members.map((item, index) => {
            const point = map.unproject([center.x + offsets[index][0], center.y + offsets[index][1]]);
            return { ...item, geometry: { type: "Point", coordinates: [point.lng, point.lat] } };
          }),
        });
        setSelected({ keys, coordinates: [event.lngLat.lng, event.lngLat.lat] });
      } catch {
        if (sequence === clickSequence.current) setClickError(true);
      }
      return;
    }

    const matchingFeature = data.features.find(
      (item) => item.properties.uuid === feature.properties?.uuid,
    );
    if (matchingFeature) {
      setSelected({
        keys: [locationGroupKey(matchingFeature)],
        coordinates: matchingFeature.properties.locationGroupCoordinates ?? matchingFeature.geometry.coordinates,
      });
    }
  };

  const selectedMembers = selected ? selected.keys.flatMap((key) => locationGroupMembers(data.features, key)) : [];
  const expandedFeatures = expanded?.input === data.features ? expanded.features : [];

  return (
    <div className="validation-map-card">
      <div className="validation-map-card__heading">
        <div>
          <h2 id="validation-map-heading">Report locations</h2>
        </div>
        <span>{data.metadata.returnedCount} shown</span>
      </div>
      <div className="validation-map" aria-label="Map of submitted report locations">
        {mapTilerStyle ? (
          <>
            <Map
            ref={mapRef}
            initialViewState={WORLD_VIEW}
            mapStyle={mapTilerStyle}
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
            {selected && selectedMembers.length > 0 ? (
              <PointPopup
                features={selectedMembers}
                coordinates={selected.coordinates}
                truncated={data.metadata.truncated}
                onClose={() => { clickSequence.current++; setSelected(null); setExpanded(null); }}
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
      {clickError ? <p role="status">Location could not be expanded. Open reports from the table below.</p> : null}
      <MapLegend />
    </div>
  );
}
