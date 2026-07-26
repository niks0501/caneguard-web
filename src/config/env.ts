import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.url().default("http://localhost:8000"),
  VITE_DATA_SOURCE: z.enum(["api", "mock"]).default("api"),
  VITE_REPORT_REFRESH_MS: z.coerce.number().int().positive().default(15_000),
});

export type AppEnv = {
  apiBaseUrl: string;
  dataSource: "api" | "mock";
  reportRefreshMs: number;
};

export function parseEnv(source: Record<string, unknown>): AppEnv {
  const parsed = envSchema.parse(source);

  return {
    apiBaseUrl: parsed.VITE_API_BASE_URL.replace(/\/$/, ""),
    dataSource: parsed.VITE_DATA_SOURCE,
    reportRefreshMs: parsed.VITE_REPORT_REFRESH_MS,
  };
}

export const env = parseEnv(import.meta.env);
