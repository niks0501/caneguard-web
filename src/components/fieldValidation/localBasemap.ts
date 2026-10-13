import type { StyleSpecification } from "maplibre-gl";

/**
 * Provider-free basemap for local development when no MapTiler key is
 * configured, so marker, cluster and queue interaction stays exercisable
 * without a hosted tile service. Deliberately source-less: one flat background
 * keeps the operating area and its markers visible without a tile request.
 *
 * It sets no `glyphs` URL on purpose. MapLibre then draws symbol text (cluster
 * counts and the five status glyphs) locally from the browser's fonts, so case
 * meaning stays legible offline. The fill matches the `--color-surface-soft`
 * token the map container already uses.
 */
export const LOCAL_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "local-basemap-background",
      type: "background",
      paint: { "background-color": "#edf3ed" },
    },
  ],
};

/** The hosted basemap style served by MapTiler for a configured key. */
export function mapTilerStyleUrl(mapTilerKey: string): string | undefined {
  return mapTilerKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`
    : undefined;
}

/**
 * The basemap the map should draw, or `undefined` when it must keep its
 * explicit "Map unavailable" state instead. The provider-free fallback is
 * limited to development builds so production keeps that failure state, and a
 * configured key always wins over the fallback.
 */
export function resolveBasemapStyle(
  mapTilerKey: string,
  isDevelopment: boolean,
): string | StyleSpecification | undefined {
  const hostedStyle = mapTilerStyleUrl(mapTilerKey);

  if (hostedStyle) return hostedStyle;

  return isDevelopment ? LOCAL_BASEMAP_STYLE : undefined;
}
