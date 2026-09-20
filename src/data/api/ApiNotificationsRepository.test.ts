import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createAxiosClient } from "../../api/axiosClient";
import { server } from "../../test/server";
import { ApiNotificationsRepository } from "./ApiNotificationsRepository";

const notification = {
  id: "notification-1",
  event_type: "new_case_submitted",
  title: "New case ready for review",
  message: "CG-20260817-ABCD was submitted and is ready for review.",
  case: {
    uuid: "report-1",
    reference_code: "CG-20260817-ABCD",
  },
  is_read: false,
  read_at: null,
  created_at: "2026-08-17T10:00:00.000Z",
};

describe("ApiNotificationsRepository", () => {
  it("maps the durable notification feed and read mutations", async () => {
    const baseUrl = "https://api.caneguard.test";
    server.use(
      http.get(`${baseUrl}/api/v1/notifications`, () =>
        HttpResponse.json({
          data: [notification],
          meta: { unread_count: 1, returned_count: 1 },
        }),
      ),
      http.patch(`${baseUrl}/api/v1/notifications/notification-1/read`, () =>
        HttpResponse.json({
          data: {
            ...notification,
            is_read: true,
            read_at: "2026-08-17T10:01:00.000Z",
          },
        }),
      ),
      http.post(`${baseUrl}/api/v1/notifications/read-all`, () =>
        HttpResponse.json({
          data: [],
          meta: { marked_count: 1, unread_count: 0 },
        }),
      ),
    );
    const repository = new ApiNotificationsRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );

    await expect(repository.listNotifications()).resolves.toEqual({
      notifications: [
        expect.objectContaining({
          id: "notification-1",
          eventType: "new_case_submitted",
          caseUuid: "report-1",
          isRead: false,
        }),
      ],
      unreadCount: 1,
    });
    await expect(
      repository.markNotificationRead("notification-1"),
    ).resolves.toMatchObject({ isRead: true });
    await expect(repository.markAllNotificationsRead()).resolves.toBeUndefined();
  });
});
