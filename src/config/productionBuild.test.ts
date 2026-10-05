import { describe, expect, it } from "vitest";
import { validateProductionBuild } from "./productionBuild";

const safe = {
  VITE_API_BASE_URL: "https://caneguard.example.test",
  VITE_DATA_SOURCE: "api",
  VITE_REALTIME_ENABLED: "false",
};

describe("production build inputs", () => {
  it("accepts an explicit public HTTPS origin with closed realtime", () => {
    expect(() => validateProductionBuild(safe)).not.toThrow();
  });
  it.each([
    undefined, "", " ", "invalid", "http://caneguard.example.test",
    "https://localhost", "https://app.localhost", "https://localhost.",
    "https://127.0.0.1", "https://127.1", "https://[::1]", "https://0.0.0.0",
    "https://10.0.0.1", "https://192.168.1.1", "https://172.16.0.1",
    "https://app.railway.internal", "https://*.example.test", "https://user:password@caneguard.example.test",
    "https://caneguard.example.test/api", "https://caneguard.example.test?q=1",
    "https://caneguard.example.test/#fragment",
  ])("rejects unsafe API base %s without exposing its value", (base) => {
    expect(() => validateProductionBuild({ ...safe, VITE_API_BASE_URL: base }))
      .toThrow(/public HTTPS origin/);
  });
  it("requires API data and explicit closed realtime", () => {
    for (const source of [
      { ...safe, VITE_DATA_SOURCE: "mock" },
      { ...safe, VITE_DATA_SOURCE: undefined },
      { ...safe, VITE_REALTIME_ENABLED: "true" },
      { ...safe, VITE_REALTIME_ENABLED: undefined },
    ]) expect(() => validateProductionBuild(source)).toThrow();
  });
});
