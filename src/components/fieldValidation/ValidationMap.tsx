import { useState } from "react";
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

export function ValidationMap({ data }: { data: FieldValidationMapData }) {
  const [selected, setSelected] = useState<{
    feature: FieldValidationMapFeature;
    coordinates: [number, number];
  } | null>(null);
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
          <Map
            initialViewState={{ longitude: 122.5, latitude: 10.5, zoom: 6 }}
            mapStyle={mapTilerStyle}
            interactiveLayerIds={["validation-clusters", "validation-points"]}
            onClick={handleClick}
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
        ) : (
          <div className="validation-map__unavailable" role="status">
            <strong>Interactive map unavailable</strong>
            <p>Configure VITE_MAPTILER_KEY to load the MapTiler basemap. The report table below remains available.</p>
          </div>
        )}
      </div>
      <MapLegend />
    </div>
  );
}
