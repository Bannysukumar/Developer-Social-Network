import type { MessageDto, NotificationDto } from "../shared/api-types";
import type { ServerFrame } from "./chat-socket";

export type LiveRefresh = "social" | "conversations" | null;

export interface LivePatch {
  readonly messages?: MessageDto[];
  readonly notifications?: NotificationDto[];
  readonly unreadNotifications?: number;
  readonly bumpConversation?: string;
  readonly toast?: string | null;
  readonly toastSeq?: number;
  readonly refresh: LiveRefresh;
}

/** Backoff: 1s, 2s, 4s, 8s, 16s, then 30s. */
export function retryDelayMs(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 1_000 * 2 ** Math.min(step, 5));
}

export function mergeLiveMessage(
  messages: readonly MessageDto[],
  incoming: MessageDto,
  activeConversationId: string | null,
  selfId: string | null,
  toastSeq: number,
): LivePatch {
  if (incoming.conversationId === activeConversationId) {
    if (messages.some((item) => item.id === incoming.id)) return { refresh: null };
    return { messages: [incoming, ...messages], refresh: null };
  }
  const fromOther = incoming.senderId !== selfId;
  return {
    bumpConversation: fromOther ? incoming.conversationId : undefined,
    toast: fromOther ? "New message" : null,
    toastSeq: fromOther ? toastSeq + 1 : toastSeq,
    refresh: "conversations",
  };
}

export function mergeReceipt(messages: readonly MessageDto[], frame: ServerFrame): MessageDto[] | undefined {
  if (frame.type !== "DELIVERED" && frame.type !== "READ") return undefined;
  const data = frame.data;
  if (!data || typeof data !== "object") return undefined;
  const record = data as { messageId?: unknown; status?: unknown };
  if (typeof record.messageId !== "string") return undefined;
  const status: MessageDto["status"] = frame.type === "READ" ? "READ" : "DELIVERED";
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== record.messageId || message.status === status || message.status === "READ") return message;
    changed = true;
    return { ...message, status };
  });
  return changed ? next : undefined;
}

export function mergeNotification(
  notifications: readonly NotificationDto[],
  incoming: NotificationDto,
  unreadNotifications: number,
  toastSeq: number,
): LivePatch {
  if (notifications.some((item) => item.id === incoming.id)) return { refresh: null };
  const social = incoming.type === "FRIEND_REQUEST" || incoming.type === "FRIEND_REQUEST_ACCEPTED";
  return {
    notifications: [incoming, ...notifications],
    unreadNotifications: incoming.read ? unreadNotifications : unreadNotifications + 1,
    toast: incoming.message,
    toastSeq: toastSeq + 1,
    refresh: social ? "social" : incoming.type === "NEW_MESSAGE" ? "conversations" : null,
  };
}
