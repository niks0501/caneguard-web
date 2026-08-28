import type {
  AppNotification,
  NotificationsFeed,
} from "../../domain/notification.types";

export interface NotificationsRepository {
  listNotifications(limit?: number): Promise<NotificationsFeed>;
  markNotificationRead(notificationId: string): Promise<AppNotification>;
  markAllNotificationsRead(): Promise<void>;
}
