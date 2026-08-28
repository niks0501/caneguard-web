import { queryOptions } from "@tanstack/react-query";
import { notificationsRepository } from "../services/notifications.service";
import { getOperationalQueryRefreshOptions } from "./queryRefresh";

export const notificationsKeys = {
  all: ["notifications"] as const,
  feed: (limit = 20) => [...notificationsKeys.all, "feed", limit] as const,
};

export const notificationsQueryOptions = (
  options: { enabled?: boolean; limit?: number } = {},
) => {
  const limit = options.limit ?? 20;

  return queryOptions({
    queryKey: notificationsKeys.feed(limit),
    queryFn: () => notificationsRepository.listNotifications(limit),
    enabled: options.enabled,
    ...getOperationalQueryRefreshOptions(),
  });
};
