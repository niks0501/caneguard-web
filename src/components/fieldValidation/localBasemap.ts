import type { StyleSpecification } from "maplibre-gl";
import type { Theme } from "../../theme/themePreference";

/**
 * Provider-free basemap for local development when no MapTiler key is
 * configured, so marker, cluster and queue interaction stays exercisable
 * without a hosted tile service. Deliberately source-less: one flat background
 * keeps the operating area and its markers visible without a tile request.
 *
 * It sets no `glyphs` URL on purpose. MapLibre then draws symbol text (cluster
 * counts and the five status glyphs) locally from the browser's fonts, so case
 * meaning stays legible offline. The fill matches the `--color-surface-soft`
 * token the map container already uses, and the dark field matches its dark
 * value so a dark map keeps the same quiet, flat ground.
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

/** The dark counterpart: `--color-surface-soft` from the dark token block. */
export const LOCAL_BASEMAP_STYLE_DARK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "local-basemap-background",
      type: "background",
      paint: { "background-color": "#2a2e28" },
    },
  ],
};

/**
 * The hosted basemap style served by MapTiler for a configured key. The dark
 * choice uses the provider's dark rendition of the same streets style, so the
 * dark map is a real map rather than a dimmed paper one.
 */
export function mapTilerStyleUrl(
  mapTilerKey: string,
  theme: Theme = "paper",
): string | undefined {
  if (!mapTilerKey) return undefined;
  const style = theme === "dark" ? "streets-v2-dark" : "streets-v2";
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(mapTilerKey)}`;
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
  theme: Theme = "paper",
): string | StyleSpecification | undefined {
  const hostedStyle = mapTilerStyleUrl(mapTilerKey, theme);

  if (hostedStyle) return hostedStyle;

  if (!isDevelopment) return undefined;
  return theme === "dark" ? LOCAL_BASEMAP_STYLE_DARK : LOCAL_BASEMAP_STYLE;
}
