import type { AxiosInstance } from "axios";
import { axiosClient } from "../../api/axiosClient";
import type {
  AppNotification,
  NotificationsFeed,
} from "../../domain/notification.types";
import type { NotificationsRepository } from "../contracts/NotificationsRepository";
import {
  markAllNotificationsReadResponseSchema,
  notificationResponseSchema,
  notificationsResponseSchema,
} from "./schemas/notification.schema";
import { mapNotification } from "./mappers/notification.mapper";

export class ApiNotificationsRepository implements NotificationsRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async listNotifications(limit = 20): Promise<NotificationsFeed> {
    const response = await this.client.get("/api/v1/notifications", {
      params: { limit },
    });
    const dto = notificationsResponseSchema.parse(response.data);

    return {
      notifications: dto.data.map(mapNotification),
      unreadCount: dto.meta.unread_count,
    };
  }

  async markNotificationRead(
    notificationId: string,
  ): Promise<AppNotification> {
    const response = await this.client.patch(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    );

    return mapNotification(
      notificationResponseSchema.parse(response.data).data,
    );
  }

  async markAllNotificationsRead(): Promise<void> {
    const response = await this.client.post(
      "/api/v1/notifications/read-all",
    );
    markAllNotificationsReadResponseSchema.parse(response.data);
  }
}
