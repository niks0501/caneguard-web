import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Layer,
  Map,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import { MapPin } from "lucide-react";
import { env } from "../../config/env";
import type { BarangayValidationRow } from "../../domain/dashboard.types";
import { useFieldValidationMap } from "../../hooks/useFieldValidation";
import { Skeleton } from "../ui/States";
import { dashboardChartCopy } from "./chartCopy";
import { chartTheme } from "./chartTheme";
import { NASUGBU_BARANGAY_POINTS, NASUGBU_MAP_CENTER } from "./nasugbuBarangays";

import "maplibre-gl/dist/maplibre-gl.css";

const mapTilerStyle = env.mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(env.mapTilerKey)}`
  : undefined;

const GPS_LIMIT = 100;

type MapLayer = "barangay" | "gps";

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
 * (explicit small limit). The barangay list below is a real list of links,
 * so the map is never the only route to the data.
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
  const [layer, setLayer] = useState<MapLayer>("barangay");
  const [frameRef, inView] = useInView();
  const gps = useFieldValidationMap(
    { dateFrom: from, dateTo: to, limit: GPS_LIMIT },
    { enabled: inView && layer === "gps" },
  );

  const counted = rows.filter((row) => row.submitted > 0 || row.open > 0);
  const countFor = (barangay: string) =>
    counted.find((row) => row.barangay === barangay);
  const circles = NASUGBU_BARANGAY_POINTS.filter((point) =>
    countFor(point.barangay),
  ).map((point) => ({
    type: "Feature" as const,
    properties: {
      barangay: point.barangay,
      submitted: countFor(point.barangay)?.submitted ?? 0,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [point.longitude, point.latitude],
    },
  }));
  const maxSubmitted = Math.max(1, ...circles.map((circle) => circle.properties.submitted));

  const gpsFeatures = (gps.data?.features ?? []).map((feature) => ({
    type: "Feature" as const,
    properties: { uuid: feature.properties.uuid },
    geometry: feature.geometry,
  }));

  return (
    <div className="col-12">
      <section aria-labelledby="chart-location-map" className="decision-chart-card">
        <h3 id="chart-location-map" className="decision-chart-card__title">
          {copy.title}
        </h3>
        <p className="decision-chart-card__hint">{copy.hint}</p>
        <p className="decision-chart-card__period">{scopeLabel}</p>
        <div className="decision-chart__toggle" role="group" aria-label="Map layer">
          <button
            type="button"
            aria-pressed={layer === "barangay"}
            className={layer === "barangay" ? "decision-chart__toggle-option decision-chart__toggle-option--active" : "decision-chart__toggle-option"}
            onClick={() => setLayer("barangay")}
          >
            {copy.barangayLayer}
          </button>
          <button
            type="button"
            aria-pressed={layer === "gps"}
            className={layer === "gps" ? "decision-chart__toggle-option decision-chart__toggle-option--active" : "decision-chart__toggle-option"}
            onClick={() => setLayer("gps")}
          >
            {copy.gpsLayer}
          </button>
        </div>
        <div ref={frameRef} className="decision-map" aria-label="Map of field-report locations">
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
            >
              <NavigationControl position="top-right" showCompass={false} />
              {layer === "barangay" ? (
                <Source
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
                        Math.sqrt(maxSubmitted),
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
                      "circle-radius": 6,
                      "circle-stroke-color": chartTheme.surface || "#ffffff",
                      "circle-stroke-width": 2,
                    }}
                  />
                </Source>
              )}
            </Map>
          )}
        </div>
        {layer === "gps" && inView && gps.isPending ? (
          <p className="decision-chart-card__hint" role="status">
            Loading GPS points…
          </p>
        ) : null}
        {layer === "gps" && inView && gps.data ? (
          <p className="decision-chart-card__hint">
            {gps.data.metadata.returnedCount} GPS points shown (limit {GPS_LIMIT})
            {gps.data.metadata.truncated ? "; a sample only" : ""}.
          </p>
        ) : null}
        <ul className="decision-chart__barangay-list">
          {counted.map((row) => (
            <li key={row.barangay}>
              <Link to={`/reports?barangay=${encodeURIComponent(row.barangay)}`}>
                <MapPin aria-hidden="true" />
                <strong>{row.barangay}</strong>{" "}
                <span>
                  {row.submitted} submitted · {row.open} open validation
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
