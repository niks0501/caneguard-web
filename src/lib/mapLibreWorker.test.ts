import { getWorkerUrl } from "maplibre-gl";
import { describe, expect, it } from "vitest";

describe("map worker registration", () => {
  it("points MapLibre at the bundled worker asset when the shared registration loads", async () => {
    await import("./mapLibreWorker");
    expect(getWorkerUrl()).toContain("maplibre-gl-worker");
  });
});
