import type { ReactNode } from "react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getWorkerUrl } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import bundledWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

vi.mock("../App", () => ({ default: () => null }));
vi.mock("../app/AppProviders", () => ({ AppProviders: ({ children }: { children: ReactNode }) => children }));

const appOrigin = "https://caneguard.online";

describe("map worker registration", () => {
  it("registers the bundled worker when the app entry loads", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import("../main");
    const registered = getWorkerUrl();

    expect(registered).toBe(bundledWorkerUrl);
    expect(new URL(registered, appOrigin).origin).toBe(appOrigin);
    expect(existsSync(join(process.cwd(), registered.split("?")[0]))).toBe(true);
  });
});
