import axios from "axios";
import type { AppEnv } from "../config/env";
import { env } from "../config/env";
import { notifySessionExpired } from "../auth/authSession";
import { toApiError } from "./ApiError";

export function createAxiosClient(config: Pick<AppEnv, "apiBaseUrl"> = env) {
  const client = axios.create({
    baseURL: config.apiBaseUrl,
    withCredentials: true,
    withXSRFToken: true,
    headers: {
      Accept: "application/json",
    },
  });
  client.defaults.headers.common.Accept = "application/json";

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error);
      if (apiError.status === 401 || apiError.status === 419) {
        notifySessionExpired();
      }
      return Promise.reject(apiError);
    },
  );

  return client;
}

export const axiosClient = createAxiosClient();
