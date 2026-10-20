import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map, NavigationControl, Popup, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { X } from "lucide-react";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature, FieldSurveyPosition } from "../../domain/fieldSurvey.types";
import { formatAreaSqm, formatDateTime } from "../../lib/formatters";
import { env } from "../../config/env";
import { resolveBasemapStyle } from "../fieldValidation/localBasemap";

import "maplibre-gl/dist/maplibre-gl.css";

const OPERATING_AREA_VIEW = {
  longitude: 120.65,
  latitude: 14.09,
  zoom: 9,
} as const;

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

function MapProviderStatus({ state }: { state: MapProviderState }) {
  if (state === "ready") return null;
  if (state === "error") {
    return (
      <div className="validation-map__provider-status validation-map__provider-status--error" role="alert">
        <strong>Map unavailable.</strong>
        <p>Field boundaries remain available in the list.</p>
      </div>
    );
  }
  return (
    <div className="validation-map__provider-status" role="status">
      <strong>Loading map...</strong>
      <p>Boundary records remain available while the basemap loads.</p>
    </div>
  );
}

function BoundaryLegend() {
  return (
    <div className="validation-map__legend boundaries-map__legend" role="group" aria-label="Boundary legend">
      <ul>
        <li><span className="boundaries-map__swatch" aria-hidden="true" /><span>Recorded field boundary</span></li>
        <li><span className="boundaries-map__swatch boundaries-map__swatch--selected" aria-hidden="true" /><span>Selected boundary</span></li>
      </ul>
    </div>
  );
}

export function BoundariesMap({
  data,
  selectedBoundaryId = null,
  popupCoordinates = null,
  onSelect,
  onClearSelection,
}: {
  data: FieldSurveyBoundariesData;
  selectedBoundaryId?: string | null;
  popupCoordinates?: FieldSurveyPosition | null;
  onSelect?: (boundaryId: string, coordinates: FieldSurveyPosition) => void;
  onClearSelection?: () => void;
}) {
  const [providerState, setProviderState] = useState<MapProviderState>("loading");
  const mapRef = useRef<MapRef | null>(null);
  const hasFittedInitialData = useRef(false);
  const lastFittedSelection = useRef<string | null>(null);
  const basemapStyle = resolveBasemapStyle(env.mapTilerKey, import.meta.env.DEV);
  const sourceData = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: data.features.map((feature) => ({
      ...feature,
      properties: { boundary_id: String(feature.properties.id) },
    })),
  }), [data.features]);
  const selectedFeature = selectedBoundaryId
    ? data.features.find((feature) => String(feature.properties.id) === selectedBoundaryId) ?? null
    : null;
  const selectedSource = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: selectedFeature
      ? [{ ...selectedFeature, properties: { boundary_id: String(selectedFeature.properties.id) } }]
      : [],
  }), [selectedFeature]);
  const popupPosition = selectedFeature
    ? popupCoordinates ?? boundsCenter(selectedFeature)
    : null;

  useEffect(() => {
    const map = mapRef.current;
    if (providerState !== "ready" || !map || hasFittedInitialData.current) return;

    const bounds = boundsForFeatures(data.features);
    if (bounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    } else {
      map.easeTo({ center: [OPERATING_AREA_VIEW.longitude, OPERATING_AREA_VIEW.latitude], zoom: OPERATING_AREA_VIEW.zoom });
    }
    hasFittedInitialData.current = true;
  }, [data.features, providerState]);

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

  const handleMapLoad = (event: { target: unknown }) => {
    mapRef.current = event.target as MapRef;
    setProviderState("ready");
  };

  const handleClick = (event: MapLayerMouseEvent) => {
    const boundaryId = event.features?.[0]?.properties?.boundary_id;
    if (boundaryId === undefined || boundaryId === null) {
      onClearSelection?.();
      return;
    }
    onSelect?.(String(boundaryId), [event.lngLat.lng, event.lngLat.lat]);
  };

  return (
    <section className="validation-map-card boundaries-map-card" aria-labelledby="boundaries-map-heading">
      <div className="validation-map-card__heading">
        <h2 id="boundaries-map-heading">Boundary map</h2>
        <span>{data.metadata.returnedCount} shown</span>
      </div>
      <div className="validation-map boundaries-map" role="region" aria-label="Map of recorded field boundaries">
        {basemapStyle ? (
          <>
            <Map
              ref={mapRef}
              initialViewState={OPERATING_AREA_VIEW}
              mapStyle={basemapStyle}
              interactiveLayerIds={["field-boundaries-fill", "field-boundaries-outline"]}
              onClick={handleClick}
              onLoad={handleMapLoad}
              onError={() => setProviderState("error")}
              reuseMaps
            >
              <NavigationControl position="top-right" showCompass={false} />
              <Source id="field-boundaries" type="geojson" data={sourceData}>
                <Layer
                  id="field-boundaries-fill"
                  type="fill"
                  paint={{ "fill-color": "#2d6b40", "fill-opacity": 0.18 }}
                />
                <Layer
                  id="field-boundaries-outline"
                  type="line"
                  paint={{ "line-color": "#1e452a", "line-width": 2 }}
                />
              </Source>
              <Source id="field-boundaries-selected" type="geojson" data={selectedSource}>
                <Layer
                  id="field-boundaries-selected-line"
                  type="line"
                  paint={{ "line-color": "#b8ad73", "line-width": 3 }}
                />
              </Source>
              {selectedFeature && popupPosition ? (
                <Popup
                  longitude={popupPosition[0]}
                  latitude={popupPosition[1]}
                  anchor="top"
                  closeButton={false}
                  closeOnClick={false}
                  closeOnMove={false}
                  onClose={() => onClearSelection?.()}
                >
                  <div className="boundaries-map__popup" role="dialog" aria-labelledby="boundary-popup-heading">
                    <div className="boundaries-map__popup-heading">
                      <h3 id="boundary-popup-heading">Field boundary</h3>
                      <button type="button" aria-label="Close boundary details" onClick={() => onClearSelection?.()}>
                        <X aria-hidden="true" />
                      </button>
                    </div>
                    <dl>
                      <div><dt>Captured</dt><dd>{formatDateTime(selectedFeature.properties.capturedAt)}</dd></div>
                      <div><dt>Area · device-reported</dt><dd>{formatAreaSqm(selectedFeature.properties.areaSqm)}</dd></div>
                      <div><dt>Inspector</dt><dd>{selectedFeature.properties.inspector.name}</dd></div>
                    </dl>
                  </div>
                </Popup>
              ) : null}
            </Map>
            <MapProviderStatus state={providerState} />
          </>
        ) : (
          <div className="validation-map__unavailable" role="alert">
            <strong>Map unavailable.</strong>
            <p>Field boundaries remain available in the list.</p>
          </div>
        )}
      </div>
      <BoundaryLegend />
    </section>
  );
}
