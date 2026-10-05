import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.url().default(import.meta.env.PROD ? "" : "http://localhost:8000"),
  VITE_DATA_SOURCE: z.enum(["api", "mock"]).default("api"),
  VITE_REPORT_REFRESH_MS: z.coerce.number().int().positive().default(600_000),
  VITE_MAPTILER_KEY: z.string().trim().default(""),
  VITE_REALTIME_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  VITE_REVERB_APP_KEY: z.string().trim().default(""),
  VITE_REVERB_HOST: z.string().trim().default("localhost"),
  VITE_REVERB_PORT: z.coerce.number().int().positive().default(8080),
  VITE_REVERB_SCHEME: z.enum(["http", "https"]).default("http"),
});

export type AppEnv = {
  apiBaseUrl: string;
  dataSource: "api" | "mock";
  reportRefreshMs: number;
  mapTilerKey: string;
  realtimeEnabled: boolean;
  reverbAppKey: string;
  reverbHost: string;
  reverbPort: number;
  reverbScheme: "http" | "https";
};

export function parseEnv(source: Record<string, unknown>): AppEnv {
  const parsed = envSchema.parse(source);

  return {
    apiBaseUrl: parsed.VITE_API_BASE_URL.replace(/\/$/, ""),
    dataSource: parsed.VITE_DATA_SOURCE,
    reportRefreshMs: parsed.VITE_REPORT_REFRESH_MS,
    mapTilerKey: parsed.VITE_MAPTILER_KEY,
    realtimeEnabled: parsed.VITE_REALTIME_ENABLED,
    reverbAppKey: parsed.VITE_REVERB_APP_KEY,
    reverbHost: parsed.VITE_REVERB_HOST,
    reverbPort: parsed.VITE_REVERB_PORT,
    reverbScheme: parsed.VITE_REVERB_SCHEME,
  };
}

export const env = parseEnv(import.meta.env);
