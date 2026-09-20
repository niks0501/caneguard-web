import { useIsFetching } from "@tanstack/react-query";
import { LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { env } from "../../config/env";
import { useApiConnectivity } from "../../api/apiConnectivity.context";

type ServerStatusValue = "connected" | "refreshing" | "unavailable" | "offline";

export function ServerStatus({ showOnlyDegraded = true }: { showOnlyDegraded?: boolean } = {}) {
  const { networkStatus, apiReachability } = useApiConnectivity();
  const activeFetches = useIsFetching({ type: "active" });
  // Endpoint failures are rendered by their owning feature. The health check
  // is the source of truth for server reachability; otherwise a reachable API
  // with one unavailable optional feature is reported as globally offline.
  const serverUnavailable = apiReachability === "unreachable";
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
          : "connected";
  const networkLabel = {
    available: "Available",
    unavailable: "Unavailable",
    unknown: "Unknown",
  }[networkStatus];
  const serverLabel =
    serverUnavailable
      ? "Unavailable"
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
    unavailable: "Server unavailable",
    offline: "Offline",
  }[status];

  if (showOnlyDegraded && status !== "unavailable" && status !== "offline") {
    return null;
  }

  const isDegraded = status === "unavailable" || status === "offline";

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
