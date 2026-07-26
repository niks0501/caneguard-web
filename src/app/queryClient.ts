import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";

export function isTransientServerError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === undefined || error.status >= 500)
  );
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  return failureCount < 1 && isTransientServerError(error);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
