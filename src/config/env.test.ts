import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("uses API-safe defaults", () => {
    expect(parseEnv({})).toEqual({
      apiBaseUrl: "http://localhost:8000",
      dataSource: "api",
      reportRefreshMs: 600_000,
      mapTilerKey: "",
      realtimeEnabled: true,
      reverbAppKey: "",
      reverbHost: "localhost",
      reverbPort: 8080,
      reverbScheme: "http",
    });
  });

  it("parses mock mode and removes one trailing slash", () => {
    expect(
      parseEnv({
        VITE_API_BASE_URL: "https://api.caneguard.test/",
        VITE_DATA_SOURCE: "mock",
        VITE_REPORT_REFRESH_MS: "30000",
        VITE_MAPTILER_KEY: "test-map-key",
      }),
    ).toEqual({
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

  it("rejects unsupported data sources", () => {
    expect(() => parseEnv({ VITE_DATA_SOURCE: "memory" })).toThrow();
  });
});
