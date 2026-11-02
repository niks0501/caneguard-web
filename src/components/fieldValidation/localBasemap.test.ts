import { describe, expect, it } from "vitest";
import {
  LOCAL_BASEMAP_STYLE,
  LOCAL_BASEMAP_STYLE_DARK,
  mapTilerStyleUrl,
  resolveBasemapStyle,
} from "./localBasemap";

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

  it("keeps the local basemap free of hosted resource URLs", () => {
    const hostedUrls: string[] = [];
    const collectHostedUrls = (value: unknown) => {
      if (typeof value === "string" && /^https?:\/\//i.test(value)) {
        hostedUrls.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(collectHostedUrls);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(collectHostedUrls);
      }
    };

    collectHostedUrls(LOCAL_BASEMAP_STYLE);
    expect(hostedUrls).toEqual([]);
  });
});

describe("dark basemap", () => {
  it("asks the provider for its dark rendition of the configured style", () => {
    expect(mapTilerStyleUrl("map-key", "dark")).toBe(
      "https://api.maptiler.com/maps/streets-v2-dark/style.json?key=map-key",
    );
    expect(resolveBasemapStyle("map-key", true, "dark")).toBe(
      mapTilerStyleUrl("map-key", "dark"),
    );
  });

  it("keeps the paper hosted style for the default appearance", () => {
    expect(mapTilerStyleUrl("map-key")).toBe(
      "https://api.maptiler.com/maps/streets-v2/style.json?key=map-key",
    );
    expect(mapTilerStyleUrl("map-key", "paper")).toBe(mapTilerStyleUrl("map-key"));
  });

  it("draws the provider-free dark ground in dark and nothing in production", () => {
    expect(resolveBasemapStyle("", true, "dark")).toBe(LOCAL_BASEMAP_STYLE_DARK);
    expect(resolveBasemapStyle("", false, "dark")).toBeUndefined();
    expect(LOCAL_BASEMAP_STYLE_DARK).not.toBe(LOCAL_BASEMAP_STYLE);
  });

  it("keeps the dark ground free of hosted resource URLs", () => {
    const hostedUrls: string[] = [];
    const collectHostedUrls = (value: unknown) => {
      if (typeof value === "string" && /^https?:\/\//i.test(value)) {
        hostedUrls.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(collectHostedUrls);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(collectHostedUrls);
      }
    };

    collectHostedUrls(LOCAL_BASEMAP_STYLE_DARK);
    expect(hostedUrls).toEqual([]);
  });
});
