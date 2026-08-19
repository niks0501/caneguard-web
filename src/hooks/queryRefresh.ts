import { env } from "../config/env";

export function getOperationalQueryRefreshOptions(
  dataSource: typeof env.dataSource = env.dataSource,
  reportRefreshMs: typeof env.reportRefreshMs = env.reportRefreshMs,
) {
  return {
    refetchInterval: dataSource === "api" ? reportRefreshMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } as const;
}
