import type { ReactNode } from "react";
import { getWorkerUrl } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import bundledWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

vi.mock("../App", () => ({ default: () => null }));
vi.mock("../app/AppProviders", () => ({ AppProviders: ({ children }: { children: ReactNode }) => children }));

describe("map worker registration", () => {
  it("registers the bundled worker when the app entry loads", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import("../main");
    expect(getWorkerUrl()).toBe(bundledWorkerUrl);
  });
});
