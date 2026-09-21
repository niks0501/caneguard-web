import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import type { AppEnv } from "../config/env";
import { env } from "../config/env";

const healthResponseSchema = z.object({
  data: z.object({
    status: z.enum(["ok", "degraded"]),
    checks: z.record(z.string(), z.enum(["ready", "unavailable"])),
  }),
});

type ApiHealthChecks = Record<string, "ready" | "unavailable">;

export type ApiReachability = "unknown" | "checking" | "reachable" | "degraded" | "unreachable";

export type ApiHealthResult =
  | {
      reachability: "reachable";
      checks: ApiHealthChecks;
    }
  | {
      reachability: "degraded";
      checks?: ApiHealthChecks;
      reason?: "unhealthy";
    }
  | {
      reachability: "unreachable";
      reason: "timeout" | "network" | "unhealthy" | "malformed";
    };

export function createApiHealthClient(
  config: Pick<AppEnv, "apiBaseUrl"> = env,
): AxiosInstance {
  return axios.create({
    baseURL: config.apiBaseUrl,
    timeout: 4_000,
    withCredentials: false,
    headers: {
      Accept: "application/json",
    },
  });
}

export const apiHealthClient = createApiHealthClient();

function classifyHealthFailure(error: unknown): Extract<ApiHealthResult, { reachability: "unreachable" }> {
  if (!axios.isAxiosError(error)) {
    return { reachability: "unreachable", reason: "network" };
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return { reachability: "unreachable", reason: "timeout" };
  }

  if (!error.response) {
    return { reachability: "unreachable", reason: "network" };
  }

  const parsed = healthResponseSchema.safeParse(error.response.data);
  return {
    reachability: "unreachable",
    reason: parsed.success && parsed.data.data.status === "degraded"
      ? "unhealthy"
      : "malformed",
  };
}

export async function checkApiHealth(
  client: Pick<AxiosInstance, "get"> = apiHealthClient,
): Promise<ApiHealthResult> {
  try {
    const response = await client.get("/api/health");
    const parsed = healthResponseSchema.safeParse(response.data);

    if (!parsed.success) {
      return { reachability: "unreachable", reason: "malformed" };
    }

    if (parsed.data.data.status !== "ok") {
      return { reachability: "unreachable", reason: "unhealthy" };
    }

    return {
      reachability: "reachable",
      checks: parsed.data.data.checks,
    };
  } catch (error) {
    return classifyHealthFailure(error);
  }
}
