import type { AppNotification } from "../../../domain/notification.types";
import type { NotificationDto } from "../schemas/notification.schema";

export function mapNotification(dto: NotificationDto): AppNotification {
  return {
    id: dto.id,
    eventType: dto.event_type,
    title: dto.title,
    message: dto.message,
    caseUuid: dto.case.uuid,
    referenceCode: dto.case.reference_code,
    isRead: dto.is_read,
    readAt: dto.read_at,
    createdAt: dto.created_at,
  };
}
