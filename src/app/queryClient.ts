import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
