import {
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  useIsFetching,
  useQueryClient,
} from "@tanstack/react-query";
import { LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { isTransientServerError } from "../../app/queryClient";

type ServerStatusValue = "connected" | "refreshing" | "unavailable";

export function ServerStatus() {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const activeFetches = useIsFetching({ type: "active" });
  const subscribe = useCallback(
    (onStoreChange: () => void) => queryCache.subscribe(onStoreChange),
    [queryCache],
  );
  const getUnavailableSnapshot = useCallback(
    () =>
      queryCache
        .findAll({ type: "active" })
        .some((query) => isTransientServerError(query.state.error)),
    [queryCache],
  );
  const unavailable = useSyncExternalStore(
    subscribe,
    getUnavailableSnapshot,
    getUnavailableSnapshot,
  );
  const status: ServerStatusValue =
    activeFetches > 0
      ? "refreshing"
      : unavailable
        ? "unavailable"
        : "connected";
  const label = {
    connected: "Connected",
    refreshing: "Refreshing",
    unavailable: "Server unavailable",
  }[status];

  return (
    <span
      className={`server-status server-status--${status}`}
      role="status"
      aria-label={`Server status: ${label}`}
      aria-live="polite"
    >
      {status === "refreshing" ? (
        <LoaderCircle className="spin" aria-hidden="true" />
      ) : status === "unavailable" ? (
        <WifiOff aria-hidden="true" />
      ) : (
        <Wifi aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
