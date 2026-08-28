import { env } from "../config/env";
import { ApiNotificationsRepository } from "../data/api/ApiNotificationsRepository";
import type { NotificationsRepository } from "../data/contracts/NotificationsRepository";
import { MockNotificationsRepository } from "../data/mock/MockNotificationsRepository";

export function createNotificationsRepository(
  dataSource: "api" | "mock" = env.dataSource,
): NotificationsRepository {
  return dataSource === "mock"
    ? new MockNotificationsRepository()
    : new ApiNotificationsRepository();
}

export const notificationsRepository = createNotificationsRepository();
