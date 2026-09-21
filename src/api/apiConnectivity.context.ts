import { createContext, useContext } from "react";
import type { ApiHealthResult, ApiReachability } from "./apiHealth";

export type NetworkStatus = "unknown" | "available" | "unavailable";

export interface ApiConnectivitySnapshot {
  networkStatus: NetworkStatus;
  apiReachability: ApiReachability;
  checkApiReachability: () => Promise<ApiHealthResult | null>;
  isDegraded?: boolean;
}

export const ApiConnectivityContext =
  createContext<ApiConnectivitySnapshot | null>(null);

export function useApiConnectivity(): ApiConnectivitySnapshot {
  const context = useContext(ApiConnectivityContext);
  if (!context) {
    throw new Error("useApiConnectivity must be used within ApiConnectivityProvider");
  }
  return context;
}
