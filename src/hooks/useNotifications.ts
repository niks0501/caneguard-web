import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { NotificationsFeed } from "../domain/notification.types";
import { notificationsRepository } from "../services/notifications.service";
import {
  notificationsKeys,
  notificationsQueryOptions,
} from "./notificationQueries";

export function useNotifications(options: {
  enabled?: boolean;
  limit?: number;
} = {}) {
  return useQuery(notificationsQueryOptions(options));
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsRepository.markNotificationRead(notificationId),
    onSuccess: (notification) => {
      queryClient.setQueryData<NotificationsFeed>(
        notificationsKeys.feed(),
        (current) => {
          if (!current) return current;

          const previous = current.notifications.find(
            (item) => item.id === notification.id,
          );
          const unreadDelta = previous && !previous.isRead ? 1 : 0;

          return {
            notifications: current.notifications.map((item) =>
              item.id === notification.id ? notification : item,
            ),
            unreadCount: Math.max(0, current.unreadCount - unreadDelta),
          };
        },
      );
      return queryClient.invalidateQueries({
        queryKey: notificationsKeys.all,
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsRepository.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.setQueryData<NotificationsFeed>(
        notificationsKeys.feed(),
        (current) => {
          if (!current) return current;

          const readAt = new Date().toISOString();
          return {
            notifications: current.notifications.map((notification) => ({
              ...notification,
              isRead: true,
              readAt: notification.readAt ?? readAt,
            })),
            unreadCount: 0,
          };
        },
      );
      return queryClient.invalidateQueries({
        queryKey: notificationsKeys.all,
      });
    },
  });
}
