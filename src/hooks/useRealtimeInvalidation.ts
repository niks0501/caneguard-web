import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { env } from "../config/env";
import { createEchoClient } from "../realtime/echo";
import {
  domainsFromRealtimePayload,
  invalidateRealtimeQueries,
  realtimeAttentionEventName,
  realtimeEventName,
} from "./realtimeInvalidation";

export type RealtimeStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "degraded";

export function useRealtimeInvalidation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeStatus>("connecting");
  const userUuid = auth.user?.uuid;
  const hasAuthenticatedSession =
    env.dataSource === "api" &&
    auth.status === "authenticated" &&
    Boolean(userUuid);
  const realtimeConfigured =
    hasAuthenticatedSession &&
    env.realtimeEnabled &&
    Boolean(env.reverbAppKey);

  useEffect(() => {
    if (!realtimeConfigured || !userUuid) return;

    let echo: ReturnType<typeof createEchoClient> | undefined;
    let disposed = false;
    let failureReported = false;
    let disconnectTimer: number | undefined;
    const reportUnavailable = () => {
      if (failureReported) return;
      failureReported = true;
      setConnectionStatus("degraded");
      if (import.meta.env.DEV) {
        console.debug("Realtime updates are unavailable; using periodic refresh.");
      }
      disconnectTimer = window.setTimeout(() => {
        if (!disposed) echo?.disconnect();
      }, 0);
    };

    try {
      echo = createEchoClient();
      const pusherConnection = echo.connector.pusher.connection;
      pusherConnection.bind("error", reportUnavailable);
      const channelName = `users.${userUuid}`;
      const channel = echo.private(channelName);
      const invalidateFromRealtime = (payload: unknown) => {
        void invalidateRealtimeQueries(
          queryClient,
          domainsFromRealtimePayload(payload),
        );
      };
      channel.listen(realtimeEventName, invalidateFromRealtime);
      channel.listen(realtimeAttentionEventName, invalidateFromRealtime);
      channel.error(reportUnavailable);

      const unsubscribeConnection = echo.connector.onConnectionChange(
        (status) => {
          if (status === "connected") {
            setConnectionStatus("connected");
            return;
          }
          setConnectionStatus("degraded");
          if (status === "failed") reportUnavailable();
        },
      );

      return () => {
        disposed = true;
        if (disconnectTimer !== undefined) {
          window.clearTimeout(disconnectTimer);
        }
        pusherConnection.unbind("error", reportUnavailable);
        unsubscribeConnection();
        echo?.leave(channelName);
        echo?.disconnect();
      };
    } catch {
      if (import.meta.env.DEV) {
        console.debug("Realtime updates could not start; using periodic refresh.");
      }
      echo?.disconnect();
      const timer = window.setTimeout(() => {
        if (!disposed) setConnectionStatus("degraded");
      }, 0);

      return () => {
        disposed = true;
        window.clearTimeout(timer);
      };
    }
  }, [queryClient, realtimeConfigured, userUuid]);

  const status: RealtimeStatus = realtimeConfigured
    ? connectionStatus
    : "disabled";

  return { status };
}
