import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Layer,
  Map,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { routes } from "../../app/routes";
import { locationGroupKey, locationGroupMembers } from "../fieldValidation/locationGroups";
import { formatValidationDate } from "../fieldValidation/fieldValidation.format";
import { reviewStatusLabels } from "../../domain/report.metadata";
import { env } from "../../config/env";
import type { BarangayValidationRow } from "../../domain/dashboard.types";
import { useFieldValidationMap } from "../../hooks/useFieldValidation";
import { Skeleton } from "../ui/States";
import { dashboardChartCopy } from "./chartCopy";
import { chartTheme } from "./chartTheme";
import {
  readDashboardPreferences,
  saveDashboardMapLayer,
  type MapLayer,
} from "./dashboardPreferences";
import { NASUGBU_BARANGAY_POINTS, NASUGBU_MAP_CENTER } from "./nasugbuBarangays";
import { registerMissingMapImage } from "./registerMissingMapImage";

import "maplibre-gl/dist/maplibre-gl.css";

const mapTilerStyle = env.mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(env.mapTilerKey)}`
  : undefined;

const GPS_LIMIT = 100;

/** Layer ids whose dots answer clicks (the map-wide handlers filter on these). */
const INTERACTIVE_LAYER_IDS = [
  "dashboard-barangay-circle",
  "dashboard-gps-point",
];

/** The dot whose summary popup is open, with the counts it carries. */
type SelectedDot =
  | {
      layer: "barangay";
      longitude: number;
      latitude: number;
      barangay: string;
      submitted: number;
      open: number;
    }
  | {
      layer: "gps";
      longitude: number;
      latitude: number;
      groupKey: string;
    };

function readString(properties: unknown, key: string): string {
  if (!properties || typeof properties !== "object") return "";
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readNumber(properties: unknown, key: string): number {
  if (!properties || typeof properties !== "object") return 0;
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

/** Mount the map only when scrolled into view (overhaul §6). */
function useInView(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

/**
 * Map · Field-report locations — Nasugbu (overhaul §3.4, decision D5).
 * Default layer: proportional circles at the barangay reference points for
 * barangays with reports in scope. Labelled toggle: indicative GPS points
 * (explicit small limit). Every dot is interactive: clicking it opens a
 * small summary popup anchored on the map with the essential counts and a
 * link through to the barangay reports register or the single report. The
 * barangay list below is a real list of links and stays the keyboard route
 * to those destinations, so the map is never the only way through.
 */
export function ReportLocationMap({
  rows,
  scopeLabel,
  from,
  to,
}: {
  rows: BarangayValidationRow[];
  scopeLabel: string;
  from: string;
  to: string;
}) {
  const copy = dashboardChartCopy.locationMap;
  // The chosen layer is dashboard control state: it survives leaving the page
  // and reloading it, and an unreadable stored value falls back to circles.
  const [layer, setLayer] = useState<MapLayer>(
    () => readDashboardPreferences().mapLayer,
  );
  const [selected, setSelected] = useState<SelectedDot | null>(null);
  const [frameRef, inView] = useInView();
  const gps = useFieldValidationMap(
    { dateFrom: from, dateTo: to, limit: GPS_LIMIT },
    { enabled: inView && layer === "gps" },
  );

  useEffect(() => {
    saveDashboardMapLayer(layer);
  }, [layer]);

  const counted = rows.filter((row) => row.submitted > 0 || row.open > 0);
  const sortedCounted = [...counted].sort(
    (a, b) => b.submitted + b.open - (a.submitted + a.open) || a.barangay.localeCompare(b.barangay),
  );
  const TOP_BARANGAY_LIMIT = 5;
  const hasRemainder = sortedCounted.length > TOP_BARANGAY_LIMIT;
  const topBarangays = hasRemainder ? sortedCounted.slice(0, TOP_BARANGAY_LIMIT) : sortedCounted;
  const remainderBarangays = hasRemainder ? sortedCounted.slice(TOP_BARANGAY_LIMIT) : [];
  const remainderSubmitted = remainderBarangays.reduce((sum, r) => sum + r.submitted, 0);
  const remainderOpen = remainderBarangays.reduce((sum, r) => sum + r.open, 0);
  const countFor = (barangay: string) =>
    counted.find((row) => row.barangay === barangay);
  const circles = NASUGBU_BARANGAY_POINTS.filter((point) =>
    countFor(point.barangay),
  ).map((point) => ({
    type: "Feature" as const,
    properties: {
      barangay: point.barangay,
      submitted: countFor(point.barangay)?.submitted ?? 0,
      open: countFor(point.barangay)?.open ?? 0,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [point.longitude, point.latitude],
    },
  }));
  const maxSubmitted = Math.max(1, ...circles.map((circle) => circle.properties.submitted));
  // Strictly above 1: when every barangay holds a single report the interpolate
  // stops would otherwise repeat 1 and the whole circle layer is rejected as an
  // invalid expression ("strictly ascending order"), leaving a blank canvas.
  const maxRadiusStop = Math.max(2, Math.sqrt(maxSubmitted));

  const gpsGroups = [...new Set((gps.data?.features ?? []).map(locationGroupKey))];
  const gpsFeatures = gpsGroups.map((key) => {
    const feature = locationGroupMembers(gps.data?.features ?? [], key)[0];
    return {
      type: "Feature" as const,
      properties: {
        groupKey: key,
        count: feature.properties.locationGroupSize ?? 1,
      },
      geometry: {
        ...feature.geometry,
        coordinates: feature.properties.locationGroupCoordinates ?? feature.geometry.coordinates,
      },
    };
  });
  const selectedReports = selected?.layer === "gps"
    ? locationGroupMembers(gps.data?.features ?? [], selected.groupKey)
    : [];

  const showCursor = (pointer: boolean) => (event: MapLayerMouseEvent) => {
    event.target.getCanvas().style.cursor = pointer ? "pointer" : "";
  };

  /**
   * One map-wide click handler: react-map-gl only fills `features` from the
   * layers named in `interactiveLayerIds`, and the feature carries its own
   * layer id, so a dot opens the summary for the series it belongs to.
   */
  const handleDotClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.find(
      (candidate) => candidate.layer?.id === "dashboard-gps-point",
    ) ?? event.features?.[0];
    if (!feature) return;
    const properties: unknown = feature.properties;
    if (feature.layer?.id === "dashboard-gps-point") {
      setSelected({
        layer: "gps",
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        groupKey: readString(properties, "groupKey"),
      });
      return;
    }
    setSelected({
      layer: "barangay",
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      barangay: readString(properties, "barangay"),
      submitted: readNumber(properties, "submitted"),
      open: readNumber(properties, "open"),
    });
  };

  return (
    <div className="col-12">
      <section aria-labelledby="chart-location-map" className="decision-chart-card">
        <h3 id="chart-location-map" className="decision-chart-card__title">
          {copy.title}
        </h3>
        <p className="decision-chart-card__period">{scopeLabel}</p>
        <div className="decision-chart__toggle" role="group" aria-label="Map layer">
          <button
            type="button"
            aria-pressed={layer === "barangay"}
            className={layer === "barangay" ? "decision-chart__toggle-option decision-chart__toggle-option--active" : "decision-chart__toggle-option"}
            onClick={() => {
              setLayer("barangay");
              setSelected(null);
            }}
          >
            {copy.barangayLayer}
          </button>
          <button
            type="button"
            aria-pressed={layer === "gps"}
            className={layer === "gps" ? "decision-chart__toggle-option decision-chart__toggle-option--active" : "decision-chart__toggle-option"}
            onClick={() => {
              setLayer("gps");
              setSelected(null);
            }}
          >
            {copy.gpsLayer}
          </button>
        </div>
        <div
          ref={frameRef}
          className="decision-map"
          aria-label={`Map of field-report locations: ${layer === "barangay" ? copy.barangayLayer : copy.gpsLayer}`}
        >
          {!inView ? (
            <Skeleton label="Map loads when scrolled into view" />
          ) : !mapTilerStyle ? (
            <div className="decision-map__unavailable" role="status">
              <strong>Map tiles are not configured.</strong>
            </div>
          ) : circles.length === 0 && layer === "barangay" ? (
            <div className="decision-map__unavailable" role="status">
              <strong>No located reports in this period.</strong>
            </div>
          ) : (
            <Map
              initialViewState={NASUGBU_MAP_CENTER}
              mapStyle={mapTilerStyle}
              attributionControl={{ compact: true }}
              interactiveLayerIds={INTERACTIVE_LAYER_IDS}
              onClick={handleDotClick}
              onLoad={(event) => {
                event.target.on("styleimagemissing", (missingImage) => {
                  registerMissingMapImage(event.target, missingImage.id);
                });
              }}
              onMouseEnter={showCursor(true)}
              onMouseLeave={showCursor(false)}
            >
              <NavigationControl position="top-right" showCompass={false} />
              {/* Each layer swap remounts its own <Source>: a mounted
                  react-map-gl Source pins its id and throws "source id
                  changed" when the id prop changes, which blanked the map
                  canvas on the GPS toggle. */}
              {layer === "barangay" ? (
                <Source
                  key="dashboard-barangay-circles"
                  id="dashboard-barangay-circles"
                  type="geojson"
                  data={{ type: "FeatureCollection", features: circles }}
                >
                  <Layer
                    id="dashboard-barangay-circle"
                    type="circle"
                    paint={{
                      "circle-color": chartTheme.primaryDark || "#2d6b40",
                      "circle-opacity": 0.75,
                      "circle-radius": [
                        "interpolate",
                        ["linear"],
                        ["sqrt", ["get", "submitted"]],
                        1,
                        10,
                        maxRadiusStop,
                        30,
                      ],
                      "circle-stroke-color": chartTheme.surface || "#ffffff",
                      "circle-stroke-width": 2,
                    }}
                  />
                  <Layer
                    id="dashboard-barangay-label"
                    type="symbol"
                    layout={{
                      "text-field": [
                        "concat",
                        ["get", "barangay"],
                        " (",
                        ["get", "submitted"],
                        ")",
                      ],
                      "text-size": 12,
                      "text-offset": [0, 1.2],
                      "text-allow-overlap": false,
                    }}
                    paint={{ "text-color": chartTheme.text || "#1d2720" }}
                  />
                </Source>
              ) : (
                <Source
                  key="dashboard-gps-points"
                  id="dashboard-gps-points"
                  type="geojson"
                  data={{ type: "FeatureCollection", features: gpsFeatures }}
                >
                  <Layer
                    id="dashboard-gps-point"
                    type="circle"
                    paint={{
                      "circle-color": chartTheme.primaryDark || "#2d6b40",
                      "circle-opacity": 0.85,
                      "circle-radius": ["case", [">", ["get", "count"], 1], 14, 6],
                      "circle-stroke-color": chartTheme.surface || "#ffffff",
                      "circle-stroke-width": 2,
                    }}
                  />
                  <Layer id="dashboard-gps-count" type="symbol" filter={[">", ["get", "count"], 1]} layout={{
                    "text-field": ["get", "count"],
                    "text-size": 12,
                    "text-allow-overlap": true,
                  }} paint={{ "text-color": chartTheme.surface }} />
                </Source>
              )}
              {selected && (selected.layer === "barangay" || selectedReports.length > 0) ? (
                <Popup
                  longitude={selected.longitude}
                  latitude={selected.latitude}
                  anchor="top"
                  closeOnClick={false}
                  onClose={() => setSelected(null)}
                  className="decision-map__popup"
                >
                  <div
                    className="decision-map__popup-body"
                    role="group"
                    aria-label={
                      selected.layer === "barangay"
                        ? `${selected.barangay} report summary`
                        : "Reports at this location"
                    }
                  >
                    {selected.layer === "barangay" ? (
                      <>
                        <strong className="decision-map__popup-title">
                          {selected.barangay}
                        </strong>
                        <p className="decision-map__popup-counts">
                          {selected.submitted} submitted · {selected.open} open
                          validation
                        </p>
                        <Link
                          className="decision-map__popup-link"
                          to={`/reports?barangay=${encodeURIComponent(selected.barangay)}`}
                          aria-label={`Open ${selected.barangay} reports register`}
                        >
                          Open barangay reports →
                        </Link>
                      </>
                    ) : (
                      <>
                        <strong className="decision-map__popup-title">
                          {selectedReports.length} reports at this point
                        </strong>
                        {gps.data?.metadata.truncated ? <p>Within the returned map slice.</p> : null}
                        <ul className="location-group-reports">
                          {selectedReports.map(({ properties }) => (
                            <li key={properties.uuid}>
                              <Link className="decision-map__popup-link" to={routes.reportDetail(properties.uuid)} aria-label={`Open ${properties.referenceCode}`}>{properties.referenceCode}</Link>
                              <span>{reviewStatusLabels[properties.reviewStatus]}</span>
                              <time>{formatValidationDate(properties.observedAt)}</time>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </Popup>
              ) : null}
            </Map>
          )}
        </div>
        {layer === "gps" && inView && gps.isPending ? (
          <p className="decision-chart-card__hint" role="status">
            Loading GPS points…
          </p>
        ) : null}
        {layer === "gps" && inView && gps.isError ? (
          <p className="decision-chart-card__hint" role="status">
            GPS points could not be loaded.
          </p>
        ) : null}
        {layer === "gps" && inView && gps.data ? (
          <p className="decision-chart-card__hint">
            {gps.data.metadata.returnedCount} reports shown at {gpsGroups.length} locations (limit {GPS_LIMIT})
            {gps.data.metadata.truncated ? "; a sample only" : ""}.
          </p>
        ) : null}
        <div className="decision-chart__barangay-summary">
          <ul className="decision-chart__barangay-list" aria-label="Active barangays in scope">
            {topBarangays.map((row) => (
              <li key={row.barangay}>
                <Link
                  className="decision-chart__barangay-chip"
                  to={`/reports?barangay=${encodeURIComponent(row.barangay)}`}
                >
                  <strong className="decision-chart__barangay-name">{row.barangay}</strong>{" "}
                  <span className="decision-chart__barangay-count">
                    {row.submitted} submitted · {row.open} open validation
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {remainderBarangays.length > 0 ? (
            <details className="decision-chart__barangay-remainder">
              <summary className="decision-chart__barangay-remainder-summary">
                <span>
                  +{remainderBarangays.length} more barangays ({remainderSubmitted} submitted · {remainderOpen} open validation)
                </span>
              </summary>
              <ul className="decision-chart__barangay-list decision-chart__barangay-list--remainder">
                {remainderBarangays.map((row) => (
                  <li key={row.barangay}>
                    <Link
                      className="decision-chart__barangay-chip"
                      to={`/reports?barangay=${encodeURIComponent(row.barangay)}`}
                    >
                      <strong className="decision-chart__barangay-name">{row.barangay}</strong>{" "}
                      <span className="decision-chart__barangay-count">
                        {row.submitted} submitted · {row.open} open validation
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}
