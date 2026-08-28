import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  title: z.string(),
  message: z.string(),
  case: z.object({
    uuid: z.string().nullable(),
    reference_code: z.string().nullable(),
  }),
  assignment_uuid: z.string().nullable().optional(),
  is_read: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string().nullable(),
});

export const notificationsResponseSchema = z.object({
  data: z.array(notificationSchema),
  meta: z.object({
    unread_count: z.number().int().nonnegative(),
    returned_count: z.number().int().nonnegative(),
  }),
});

export const notificationResponseSchema = z.object({
  data: notificationSchema,
});

export const markAllNotificationsReadResponseSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({
    marked_count: z.number().int().nonnegative(),
    unread_count: z.literal(0),
  }),
});

export type NotificationDto = z.infer<typeof notificationSchema>;
export type NotificationsResponseDto = z.infer<
  typeof notificationsResponseSchema
>;
