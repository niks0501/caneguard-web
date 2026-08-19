import { AxiosError } from "axios";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/server";
import {
  checkApiHealth,
  createApiHealthClient,
} from "./apiHealth";

describe("createApiHealthClient", () => {
  it("uses the API base URL without sending session credentials", () => {
    const client = createApiHealthClient({ apiBaseUrl: "https://api.test" });

    expect(client.defaults.baseURL).toBe("https://api.test");
    expect(client.defaults.timeout).toBe(4_000);
    expect(client.defaults.withCredentials).toBe(false);
  });
});

describe("checkApiHealth", () => {
  it("returns reachable for a valid ready response", async () => {
    server.use(
      http.get("https://api.test/api/health", () =>
        HttpResponse.json({
          data: {
            status: "ok",
            checks: { database: "ready", storage: "ready" },
          },
        }),
      ),
    );

    await expect(
      checkApiHealth(createApiHealthClient({ apiBaseUrl: "https://api.test" })),
    ).resolves.toEqual({
      reachability: "reachable",
      checks: { database: "ready", storage: "ready" },
    });
  });

  it("returns unhealthy when the health endpoint reports degraded dependencies", async () => {
    server.use(
      http.get("https://api.test/api/health", () =>
        HttpResponse.json(
          {
            data: {
              status: "degraded",
              checks: { database: "unavailable", storage: "ready" },
            },
          },
          { status: 503 },
        ),
      ),
    );

    await expect(
      checkApiHealth(createApiHealthClient({ apiBaseUrl: "https://api.test" })),
    ).resolves.toEqual({ reachability: "unreachable", reason: "unhealthy" });
  });

  it("distinguishes timeout and network failures", async () => {
    const timeoutClient = {
      get: vi.fn().mockRejectedValue(new AxiosError("Timed out", "ETIMEDOUT")),
    };
    const networkClient = {
      get: vi.fn().mockRejectedValue(new AxiosError("Network error", "ERR_NETWORK")),
    };

    await expect(checkApiHealth(timeoutClient)).resolves.toEqual({
      reachability: "unreachable",
      reason: "timeout",
    });
    await expect(checkApiHealth(networkClient)).resolves.toEqual({
      reachability: "unreachable",
      reason: "network",
    });
  });

  it("returns malformed for a response outside the health contract", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ data: { data: { status: "ok" } } }),
    };

    await expect(checkApiHealth(client)).resolves.toEqual({
      reachability: "unreachable",
      reason: "malformed",
    });
  });
});
