import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { env } from "../config/env";
import { createEchoClient } from "../realtime/echo";
import {
  allRealtimeDomains,
  domainsFromRealtimePayload,
  invalidateRealtimeQueries,
  realtimeAttentionEventName,
  realtimeEventName,
  realtimeReconnectDelayMs,
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
    let teardown: (() => void) | undefined;
    let disposed = false;
    // True from the first failure until the next successful connection.
    let failureReported = false;
    // True once signals may have been missed; the next connection catches up.
    let interrupted = false;
    let attempt = 0;
    let disconnectTimer: number | undefined;
    let retryTimer: number | undefined;

    const scheduleRetry = (retry: () => void) => {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (!disposed) retry();
      }, realtimeReconnectDelayMs(attempt));
      attempt += 1;
    };

    const start = () => {
      try {
        const client = createEchoClient();
        echo = client;
        const pusherConnection = client.connector.pusher.connection;
        const channelName = `users.${userUuid}`;

        const reportUnavailable = () => {
          interrupted = true;
          if (failureReported) return;
          failureReported = true;
          setConnectionStatus("degraded");
          if (import.meta.env.DEV) {
            console.debug("Realtime updates are unavailable; using periodic refresh.");
          }
          disconnectTimer = window.setTimeout(() => {
            if (!disposed) client.disconnect();
          }, 0);
          // Re-arm: resume the same socket with growing delays until it connects.
          scheduleRetry(() => {
            failureReported = false;
            client.connector.pusher.connect();
          });
        };

        pusherConnection.bind("error", reportUnavailable);
        const channel = client.private(channelName);
        const invalidateFromRealtime = (payload: unknown) => {
          void invalidateRealtimeQueries(
            queryClient,
            domainsFromRealtimePayload(payload),
          );
        };
        channel.listen(realtimeEventName, invalidateFromRealtime);
        channel.listen(realtimeAttentionEventName, invalidateFromRealtime);
        channel.error(reportUnavailable);

        const unsubscribeConnection = client.connector.onConnectionChange(
          (status) => {
            if (status === "connected") {
              failureReported = false;
              attempt = 0;
              window.clearTimeout(retryTimer);
              setConnectionStatus("connected");
              if (interrupted) {
                interrupted = false;
                void invalidateRealtimeQueries(queryClient, allRealtimeDomains);
              }
              return;
            }
            setConnectionStatus("degraded");
            if (status === "failed") {
              reportUnavailable();
            } else if (status === "disconnected") {
              interrupted = true;
            }
          },
        );

        teardown = () => {
          pusherConnection.unbind("error", reportUnavailable);
          unsubscribeConnection();
          client.leave(channelName);
          client.disconnect();
        };
      } catch {
        if (import.meta.env.DEV) {
          console.debug("Realtime updates could not start; using periodic refresh.");
        }
        echo?.disconnect();
        echo = undefined;
        interrupted = true;
        disconnectTimer = window.setTimeout(() => {
          if (!disposed) setConnectionStatus("degraded");
        }, 0);
        scheduleRetry(start);
      }
    };

    start();

    return () => {
      disposed = true;
      window.clearTimeout(disconnectTimer);
      window.clearTimeout(retryTimer);
      teardown?.();
    };
  }, [queryClient, realtimeConfigured, userUuid]);

  const status: RealtimeStatus = realtimeConfigured
    ? connectionStatus
    : "disabled";

  return { status };
}
