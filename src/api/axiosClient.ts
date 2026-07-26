import axios from "axios";
import type { AppEnv } from "../config/env";
import { env } from "../config/env";
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
    (error: unknown) => Promise.reject(toApiError(error)),
  );

  return client;
}

export const axiosClient = createAxiosClient();
