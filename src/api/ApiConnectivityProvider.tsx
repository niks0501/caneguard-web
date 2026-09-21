import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isTransientServerError } from "../app/queryClient";
import { env } from "../config/env";
import { useAuth } from "../auth/useAuth";
import {
  ApiConnectivityContext,
  type NetworkStatus,
} from "./apiConnectivity.context";
import {
  checkApiHealth,
  type ApiHealthResult,
  type ApiReachability,
} from "./apiHealth";

function getInitialNetworkStatus(): NetworkStatus {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.onLine ? "available" : "unavailable";
}

export function ApiConnectivityProvider({
  children,
  healthCheck = checkApiHealth,
}: PropsWithChildren<{
  healthCheck?: () => Promise<ApiHealthResult>;
}>) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const requestVersion = useRef(0);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    getInitialNetworkStatus,
  );
  const [apiReachability, setApiReachability] = useState<ApiReachability>(() =>
    getInitialNetworkStatus() === "unavailable" ? "unreachable" : "unknown",
  );

  const checkApiReachability = useCallback(async () => {
    const version = ++requestVersion.current;

    if (env.dataSource !== "api" || auth.status !== "authenticated") {
      setApiReachability("unknown");
      return null;
    }

    if (networkStatus === "unavailable") {
      setApiReachability("unreachable");
      return { reachability: "unreachable", reason: "network" } as const;
    }

    setApiReachability("checking");
    let result: ApiHealthResult;
    try {
      result = await healthCheck();
    } catch {
      result = { reachability: "unreachable", reason: "network" };
    }

    if (version === requestVersion.current && auth.status === "authenticated") {
      if (
        result.reachability === "degraded" ||
        (result.reachability === "unreachable" && result.reason === "unhealthy")
      ) {
        setApiReachability("degraded");
      } else {
        setApiReachability(result.reachability);
      }
    }

    return result;
  }, [auth.status, healthCheck, networkStatus]);

  useEffect(() => {
    const handleOnline = () => setNetworkStatus("available");
    const handleOffline = () => {
      requestVersion.current += 1;
      setNetworkStatus("unavailable");
      setApiReachability("unreachable");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated" || env.dataSource !== "api") {
      requestVersion.current += 1;
      return;
    }

    const checkTimer = window.setTimeout(() => {
      void checkApiReachability();
    }, 0);

    return () => window.clearTimeout(checkTimer);
  }, [auth.status, checkApiReachability]);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === "visible") {
        void checkApiReachability();
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    return () => document.removeEventListener("visibilitychange", handleResume);
  }, [checkApiReachability]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.query.queryKey[0] === "api-health") return;
      if (event.query.state.status !== "error") return;
      if (!isTransientServerError(event.query.state.error)) return;

      void checkApiReachability();
    });

    return unsubscribe;
  }, [checkApiReachability, queryClient]);

  const effectiveApiReachability =
    auth.status === "authenticated" && env.dataSource === "api"
      ? apiReachability
      : "unknown";

  return (
    <ApiConnectivityContext value={{
      networkStatus,
      apiReachability: effectiveApiReachability,
      checkApiReachability,
      isDegraded: effectiveApiReachability === "degraded",
    }}>
      {children}
    </ApiConnectivityContext>
  );
}
