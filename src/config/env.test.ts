import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the API and local backend", () => {
    const parsed = parseEnv({});

    expect(parsed.dataSource).toBe("api");
    expect(parsed.apiBaseUrl).toBe("http://localhost:8000");
    expect(parsed.reportRefreshMs).toBe(600_000);
    expect(parsed.mapTilerKey).toBe("");
  });

  it("parses mock mode and removes one trailing slash", () => {
    expect(
      parseEnv({
        VITE_API_BASE_URL: "https://api.caneguard.test/",
        VITE_DATA_SOURCE: "mock",
        VITE_REPORT_REFRESH_MS: "30000",
        VITE_MAPTILER_KEY: "test-map-key",
      }),
    ).toMatchObject({
      apiBaseUrl: "https://api.caneguard.test",
      dataSource: "mock",
      reportRefreshMs: 30_000,
      mapTilerKey: "test-map-key",
      realtimeEnabled: true,
      reverbAppKey: "",
      reverbHost: "localhost",
      reverbPort: 8080,
      reverbScheme: "http",
    });
  });

  it("trims an empty Reverb key and supports explicitly disabling realtime", () => {
    const parsed = parseEnv({
      VITE_REALTIME_ENABLED: "false",
      VITE_REVERB_APP_KEY: "  ",
    });

    expect(parsed.realtimeEnabled).toBe(false);
    expect(parsed.reverbAppKey).toBe("");
  });

  it("rejects unsupported data sources", () => {
    expect(() => parseEnv({ VITE_DATA_SOURCE: "memory" })).toThrow();
  });
});
