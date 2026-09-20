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

    try {
      echo = createEchoClient();
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
      channel.error(() => setConnectionStatus("degraded"));

      const unsubscribeConnection = echo.connector.onConnectionChange(
        (status) => {
          setConnectionStatus(status === "connected" ? "connected" : "degraded");
        },
      );

      return () => {
        disposed = true;
        unsubscribeConnection();
        echo?.leave(channelName);
        echo?.disconnect();
      };
    } catch {
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

  const status: RealtimeStatus = !hasAuthenticatedSession
    ? "disabled"
    : !realtimeConfigured
      ? "degraded"
      : connectionStatus;

  return { status };
}
