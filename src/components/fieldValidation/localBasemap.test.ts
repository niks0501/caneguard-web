import { describe, expect, it } from "vitest";
import { LOCAL_BASEMAP_STYLE, mapTilerStyleUrl, resolveBasemapStyle } from "./localBasemap";

describe("resolveBasemapStyle", () => {
  it("uses the hosted provider basemap whenever a key is configured", () => {
    const style = resolveBasemapStyle("map-key", true);

    expect(style).toBe(mapTilerStyleUrl("map-key"));
    expect(style).toContain("https://api.maptiler.com/maps/streets-v2/style.json?key=map-key");
  });

  it("falls back to the provider-free local basemap in development without a key", () => {
    expect(resolveBasemapStyle("", true)).toBe(LOCAL_BASEMAP_STYLE);
  });

  it("keeps the explicit unavailable state outside development without a key", () => {
    expect(resolveBasemapStyle("", false)).toBeUndefined();
  });

  it("draws the local basemap from no hosted source and no glyphs URL", () => {
    expect(LOCAL_BASEMAP_STYLE.sources).toEqual({});
    expect(LOCAL_BASEMAP_STYLE.glyphs).toBeUndefined();
    expect(LOCAL_BASEMAP_STYLE.layers.map((layer) => layer.type)).toEqual(["background"]);
  });
});
