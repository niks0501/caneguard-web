import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "../../domain/notification.types";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../../hooks/useNotifications";
import { NotificationBell } from "./NotificationBell";

vi.mock("../../hooks/useNotifications", () => ({
  useMarkAllNotificationsRead: vi.fn(),
  useMarkNotificationRead: vi.fn(),
  useNotifications: vi.fn(),
}));

const notifications: AppNotification[] = [
  {
    id: "notification-1",
    eventType: "new_case_submitted",
    title: "New case ready for review",
    message: "CG-20260817-ABCD was submitted and is ready for review.",
    caseUuid: "report-1",
    referenceCode: "CG-20260817-ABCD",
    isRead: false,
    readAt: null,
    createdAt: "2026-08-17T10:00:00.000Z",
  },
  {
    id: "notification-2",
    eventType: "new_case_submitted",
    title: "New case ready for review",
    message: "CG-20260817-EFGH was submitted and is ready for review.",
    caseUuid: "report-2",
    referenceCode: "CG-20260817-EFGH",
    isRead: true,
    readAt: "2026-08-17T09:00:00.000Z",
    createdAt: "2026-08-17T08:00:00.000Z",
  },
];

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  const refetch = vi.fn();
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    refetch.mockResolvedValue(undefined);
    markRead.mockResolvedValue(notifications[0]);
    markAllRead.mockResolvedValue(undefined);
    vi.mocked(useNotifications).mockReturnValue({
      data: { notifications, unreadCount: 1 },
      isFetching: false,
      isPending: false,
      isError: false,
      refetch,
    } as never);
    vi.mocked(useMarkNotificationRead).mockReturnValue({
      mutateAsync: markRead,
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useMarkAllNotificationsRead).mockReturnValue({
      mutateAsync: markAllRead,
      isPending: false,
      isError: false,
    } as never);
  });

  it("shows unread count, marks an item read, and keeps the center explicit", async () => {
    const user = userEvent.setup();
    renderBell();

    const bell = screen.getByRole("button", {
      name: "Notifications, 1 unread",
    });
    await user.click(bell);

    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("1 unread item")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New case ready for review: CG-20260817-ABCD/ })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /New case ready for review: CG-20260817-ABCD/,
      }),
    );

    expect(markRead).toHaveBeenCalledWith("notification-1");
  });

  it("provides an explicit Mark all as read action", async () => {
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(markAllRead).toHaveBeenCalledOnce();
  });
});
