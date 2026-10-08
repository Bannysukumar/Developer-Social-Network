import type { ApiClient } from "./client";
import { pathId } from "./users";
import {
  notificationListSchema,
  notificationSchema,
  type NotificationDto,
  type NotificationListDto,
} from "../shared/api-types";

export class NotificationsApi {
  constructor(private readonly client: ApiClient) {}

  list(page = 0, size = 20): Promise<NotificationListDto> {
    return this.client.request("notifications", notificationListSchema, {
      method: "GET",
      query: { page, size },
    });
  }

  markRead(notificationId: string): Promise<NotificationDto> {
    return this.client.request(
      `notifications/${pathId(notificationId)}/read`,
      notificationSchema,
      { method: "POST" },
    );
  }

  markAllRead(): Promise<unknown> {
    return this.client.request("notifications/read-all", undefined, { method: "POST" });
  }
}
