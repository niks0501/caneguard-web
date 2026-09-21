import {
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  useIsFetching,
  useQueryClient,
} from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { isTransientServerError } from "../../app/queryClient";
import { env } from "../../config/env";
import { useApiConnectivity } from "../../api/apiConnectivity.context";

type ServerStatusValue =
  | "connected"
  | "refreshing"
  | "degraded"
  | "unavailable"
  | "offline";

export function ServerStatus({
  showOnlyDegraded = true,
}: {
  showOnlyDegraded?: boolean;
} = {}) {
  const { networkStatus, apiReachability, isDegraded: connectivityDegraded } =
    useApiConnectivity();
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const activeFetches = useIsFetching({ type: "active" });

  const subscribe = useCallback(
    (onStoreChange: () => void) => queryCache.subscribe(onStoreChange),
    [queryCache],
  );
  const getHasTransientErrorSnapshot = useCallback(
    () =>
      queryCache
        .findAll({ type: "active" })
        .some((query) => isTransientServerError(query.state.error)),
    [queryCache],
  );
  const hasTransientError = useSyncExternalStore(
    subscribe,
    getHasTransientErrorSnapshot,
    getHasTransientErrorSnapshot,
  );

  const serverUnavailable = apiReachability === "unreachable";
  const serverDegraded =
    !serverUnavailable &&
    (apiReachability === "degraded" ||
      Boolean(connectivityDegraded) ||
      hasTransientError);
  const apiCheckPending =
    env.dataSource === "api" &&
    (apiReachability === "unknown" || apiReachability === "checking");
  const status: ServerStatusValue =
    networkStatus === "unavailable"
      ? "offline"
      : activeFetches > 0 || apiCheckPending
        ? "refreshing"
        : serverUnavailable
          ? "unavailable"
          : serverDegraded
            ? "degraded"
            : "connected";
  const networkLabel = {
    available: "Available",
    unavailable: "Unavailable",
    unknown: "Unknown",
  }[networkStatus];
  const serverLabel =
    serverUnavailable
      ? "Unavailable"
      : serverDegraded
        ? "Degraded"
        : apiReachability === "reachable"
          ? "Connected"
          : apiReachability === "checking"
            ? "Checking"
            : env.dataSource === "mock"
              ? "Local data"
              : "Not checked";
  const statusLabel = {
    connected: "Connected",
    refreshing: "Checking",
    degraded: "Server degraded",
    unavailable: "Server unavailable",
    offline: "Offline",
  }[status];

  const isDegraded =
    status === "unavailable" || status === "offline" || status === "degraded";

  if (showOnlyDegraded && !isDegraded) {
    return null;
  }

  return (
    <span
      className={`server-status server-status--${status}`}
      role="status"
      aria-label={`Connectivity: Network ${networkLabel}; CaneGuard server ${serverLabel}`}
      aria-live={isDegraded ? "polite" : "off"}
    >
      {status === "refreshing" ? (
        <LoaderCircle className="spin" aria-hidden="true" />
      ) : status === "unavailable" || status === "offline" ? (
        <WifiOff aria-hidden="true" />
      ) : status === "degraded" ? (
        <AlertTriangle aria-hidden="true" />
      ) : (
        <Wifi aria-hidden="true" />
      )}
      <span className="server-status__summary">{statusLabel}</span>
      <span className="server-status__details" aria-hidden="true">
        <span>
          <small>Network</small>
          <strong>{networkLabel}</strong>
        </span>
        <span>
          <small>CaneGuard server</small>
          <strong>{serverLabel}</strong>
        </span>
      </span>
    </span>
  );
}
