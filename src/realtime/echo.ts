import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { axiosClient } from "../api/axiosClient";
import { env } from "../config/env";

type ChannelAuthData = {
  auth: string;
  channel_data?: string;
};

type ChannelAuthCallback = (
  error: Error | null,
  data: ChannelAuthData | null,
) => void;

export function createEchoClient(): Echo<"reverb"> {
  return new Echo<"reverb">({
    broadcaster: "reverb",
    key: env.reverbAppKey,
    wsHost: env.reverbHost,
    wsPort: env.reverbPort,
    wssPort: env.reverbPort,
    forceTLS: env.reverbScheme === "https",
    enabledTransports: [env.reverbScheme === "https" ? "wss" : "ws"],
    unavailableTimeout: 5_000,
    disableStats: true,
    authEndpoint: `${env.apiBaseUrl}/broadcasting/auth`,
    auth: {
      headers: {
        Accept: "application/json",
      },
    },
    Pusher,
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: ChannelAuthCallback) => {
        void axiosClient
          .post("/broadcasting/auth", {
            socket_id: socketId,
            channel_name: channel.name,
          })
          .then((response) => callback(null, response.data as ChannelAuthData))
          .catch((error: unknown) => {
            callback(
              error instanceof Error
                ? error
                : new Error("The real-time channel could not be authorized."),
              null,
            );
          });
      },
    }),
  });
}
