import { Bell, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { AppNotification } from "../../domain/notification.types";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../../hooks/useNotifications";

function formatNotificationTime(timestamp: string | null) {
  if (!timestamp) return "Just now";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recently";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function notificationLabel(notification: AppNotification) {
  return `${notification.title}: ${notification.message}`;
}

export function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const notificationsQuery = useNotifications({ enabled });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleNotifications = () => {
    setIsOpen((current) => {
      if (!current && enabled) void notificationsQuery.refetch();
      return !current;
    });
  };

  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  const openNotification = (notification: AppNotification) => {
    setIsOpen(false);
    if (notification.caseUuid) {
      navigate(`/reports/${encodeURIComponent(notification.caseUuid)}`);
    }
    if (!notification.isRead) {
      void markRead.mutateAsync(notification.id).catch(() => {
        // Idempotent background acknowledgment, navigation never blocked
      });
    }
  };

  const markAllAsRead = () => {
    void markAllRead.mutateAsync();
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        className={`header-icon header-notifications${isOpen ? " is-open" : ""}`}
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        onClick={toggleNotifications}
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="notification-count" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          className="notification-panel"
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          ref={panelRef}
        >
          <div className="notification-panel__header">
            <div>
              <h2>Notifications</h2>
              <span>
                {unreadCount > 0
                  ? `${unreadCount} unread ${unreadCount === 1 ? "item" : "items"}`
                  : "All caught up"}
              </span>
            </div>
            <div className="notification-panel__actions">
              <button
                className="notification-panel__icon"
                type="button"
                aria-label="Refresh notifications"
                disabled={notificationsQuery.isFetching}
                onClick={() => void notificationsQuery.refetch()}
              >
                <RefreshCw
                  className={notificationsQuery.isFetching ? "spin" : ""}
                  aria-hidden="true"
                />
              </button>
              <button
                className="notification-panel__mark-all"
                type="button"
                disabled={unreadCount === 0 || markAllRead.isPending}
                onClick={markAllAsRead}
              >
                {markAllRead.isPending ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                <span>Mark all as read</span>
              </button>
            </div>
          </div>

          {notificationsQuery.isPending ? (
            <p className="notification-panel__state" role="status">
              Loading notifications...
            </p>
          ) : null}
          {notificationsQuery.isError ? (
            <p className="notification-panel__state notification-panel__state--error" role="alert">
              Notifications are temporarily unavailable. Refresh to try again.
            </p>
          ) : null}
          {markRead.isError || markAllRead.isError ? (
            <p className="notification-panel__state notification-panel__state--error" role="alert">
              The notification could not be updated. Your inbox is still available.
            </p>
          ) : null}
          {!notificationsQuery.isPending && !notificationsQuery.isError && notifications.length === 0 ? (
            <p className="notification-panel__state">
              No attention items yet. New submitted cases will appear here.
            </p>
          ) : null}
          {notifications.length > 0 ? (
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    className={`notification-item${notification.isRead ? "" : " is-unread"}`}
                    type="button"
                    aria-label={notificationLabel(notification)}
                    onClick={() => void openNotification(notification)}
                  >
                    <span className="notification-item__marker" aria-hidden="true" />
                    <span className="notification-item__content">
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>
                        {notification.referenceCode ?? "Case activity"} · {formatNotificationTime(notification.createdAt)}
                      </small>
                    </span>
                    {!notification.isRead ? (
                      <span className="notification-item__unread">Unread</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
