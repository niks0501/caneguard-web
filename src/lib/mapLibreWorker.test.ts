import { getWorkerUrl } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import bundledWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./mapLibreWorker";

describe("map worker registration", () => {
  it("registers the bundled worker instead of MapLibre's default sibling file", () => {
    expect(getWorkerUrl()).toBe(bundledWorkerUrl);
  });
});
