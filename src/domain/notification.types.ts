export interface AppNotification {
  id: string;
  eventType: string;
  title: string;
  message: string;
  caseUuid: string | null;
  referenceCode: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string | null;
}

export interface NotificationsFeed {
  notifications: AppNotification[];
  unreadCount: number;
}
