import type {
  AppNotification,
  NotificationsFeed,
} from "../../domain/notification.types";
import type { NotificationsRepository } from "../contracts/NotificationsRepository";

const cloneNotification = (notification: AppNotification): AppNotification => ({
  ...notification,
});

export class MockNotificationsRepository implements NotificationsRepository {
  private notifications: AppNotification[];

  constructor(initialNotifications: AppNotification[] = []) {
    this.notifications = initialNotifications.map(cloneNotification);
  }

  async listNotifications(limit = 20): Promise<NotificationsFeed> {
    const notifications = this.notifications
      .slice(0, limit)
      .map(cloneNotification);

    return {
      notifications,
      unreadCount: this.notifications.filter(
        (notification) => !notification.isRead,
      ).length,
    };
  }

  async markNotificationRead(notificationId: string): Promise<AppNotification> {
    const notification = this.notifications.find(
      (item) => item.id === notificationId,
    );

    if (!notification) {
      throw new Error(`Notification ${notificationId} was not found.`);
    }

    notification.isRead = true;
    notification.readAt = notification.readAt ?? new Date().toISOString();
    return cloneNotification(notification);
  }

  async markAllNotificationsRead(): Promise<void> {
    const readAt = new Date().toISOString();
    this.notifications.forEach((notification) => {
      notification.isRead = true;
      notification.readAt = notification.readAt ?? readAt;
    });
  }
}
