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

type TrackedMessage = MessageDto & { sendState?: "failed" | "sending" | "pending" };

function withoutLocalSending(messages: readonly TrackedMessage[], incoming: MessageDto, selfId: string | null): TrackedMessage[] {
  if (incoming.senderId !== selfId) return [...messages];
  const locals = messages.filter((item) => item.id.startsWith("local-") && (item.sendState === "sending" || item.sendState === "pending") && item.conversationId === incoming.conversationId);
  if (locals.length !== 1) return [...messages];
  return messages.filter((item) => item.id !== locals[0]?.id);
}

export function mergeLiveMessage(
  messages: readonly TrackedMessage[],
  incoming: MessageDto,
  activeConversationId: string | null,
  selfId: string | null,
  toastSeq: number,
): LivePatch {
  if (incoming.conversationId === activeConversationId) {
    const withoutLocal = withoutLocalSending(messages, incoming, selfId);
    const current = withoutLocal.find((item) => item.id === incoming.id);
    if (current) {
      if (current.deletedForEveryone && !incoming.deletedForEveryone) return { refresh: null };
      const changed = current.deletedForEveryone !== incoming.deletedForEveryone
        || current.ciphertext !== incoming.ciphertext
        || current.status !== incoming.status;
      if (!changed && withoutLocal.length === messages.length) return { refresh: null };
      return {
        messages: withoutLocal.map((item) => item.id === incoming.id ? { ...incoming } : item),
        refresh: null,
      };
    }
    return { messages: [incoming, ...withoutLocal], refresh: null };
  }
  if (incoming.deletedForEveryone) return { refresh: null };
  const fromOther = incoming.senderId !== selfId;
  return {
    bumpConversation: fromOther ? incoming.conversationId : undefined,
    toast: null,
    toastSeq: fromOther ? toastSeq + 1 : toastSeq,
    refresh: "conversations",
  };
}

const statusRank = { SENT: 0, DELIVERED: 1, READ: 2 } as const;

export function applyTombstone<T extends { id: string; ciphertext?: string | null; deletedForEveryone?: boolean; displayText?: string }>(
  messages: readonly T[],
  messageId: string,
): T[] | undefined {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId || message.deletedForEveryone) return message;
    changed = true;
    return { ...message, ciphertext: "", deletedForEveryone: true, displayText: "This message was deleted" };
  });
  return changed ? next : undefined;
}

function preferStoredHistory<T extends MessageDto & { displayText?: string }>(existing: T, item: T): T {
  if (existing.deletedForEveryone || item.deletedForEveryone) {
    return { ...item, ciphertext: "", deletedForEveryone: true, displayText: "This message was deleted" };
  }
  const kept = (statusRank[existing.status] ?? 0) > (statusRank[item.status] ?? 0) ? existing.status : item.status;
  return kept === item.status ? item : { ...item, status: kept };
}

function newestFirst<T extends { id?: string; createdAt?: string | null }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;
    const leftMissing = Number.isNaN(leftTime);
    const rightMissing = Number.isNaN(rightTime);
    if (leftMissing && rightMissing) return (right.id ?? "").localeCompare(left.id ?? "");
    if (leftMissing) return -1;
    if (rightMissing) return 1;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return (right.id ?? "").localeCompare(left.id ?? "");
  });
}

/**
 * Combines one conversation's loaded page with messages already on screen.
 * Messages from other conversations are dropped. Live messages missing from the page are kept.
 * The result stays newest-first, matching the history API.
 */
export function mergeHistory<T extends MessageDto & { displayText?: string }>(current: readonly T[], fetched: readonly T[]): T[] {
  if (fetched.length === 0) return [...current];
  const scope = fetched.find((item) => item.conversationId)?.conversationId;
  if (!scope) {
    const previous = new Map(current.map((item) => [item.id, item]));
    return fetched.map((item) => {
      const existing = previous.get(item.id);
      return existing ? preferStoredHistory(existing, item) : item;
    });
  }
  const merged = new Map<string, T>();
  for (const item of current) {
    if (item.conversationId === scope) merged.set(item.id, item);
  }
  for (const item of fetched) {
    if (item.conversationId !== scope) continue;
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? preferStoredHistory(existing, item) : item);
  }
  return newestFirst([...merged.values()]);
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

export function applyNotificationRead<T extends { id: string; read: boolean }>(
  notifications: readonly T[],
  unreadCount: number,
  updated: T,
): { notifications: T[]; unreadCount: number } {
  const previous = notifications.find((item) => item.id === updated.id);
  const next = previous
    ? notifications.map((item) => (item.id === updated.id ? updated : item))
    : [updated, ...notifications];
  const unread = previous && !previous.read && updated.read ? Math.max(0, unreadCount - 1) : unreadCount;
  return { notifications: next, unreadCount: unread };
}

/** Unread message alerts for one conversation. The notification id is not the message id. */
export function unreadMessageNotificationsForConversation<T extends { id: string; type: string; referenceId?: string | null; read: boolean }>(
  notifications: readonly T[],
  conversationId: string,
): T[] {
  return notifications.filter((note) => note.type === "NEW_MESSAGE" && !note.read && note.referenceId === conversationId);
}

/** A server refresh must not turn a confirmed read back into unread. Other conversations stay as the server sent them. */
export function absorbServerNotifications<T extends { id: string; read: boolean }>(
  incoming: readonly T[],
  unreadCount: number,
  confirmedReadIds: ReadonlySet<string>,
): { notifications: T[]; unreadCount: number } {
  let unread = unreadCount;
  const notifications = incoming.map((note) => {
    if (!confirmedReadIds.has(note.id) || note.read) return note;
    unread = Math.max(0, unread - 1);
    return { ...note, read: true };
  });
  return { notifications, unreadCount: unread };
}

/**
 * Message popups are routed by the extension host so a WebView toast cannot
 * compete with the in-editor notice or the native desktop toast.
 * Friend-request notices still use the in-view toast.
 */
export function acceptLiveToast(note: { type: string }): boolean {
  return note.type !== "NEW_MESSAGE";
}

export function mergeNotification(
  notifications: readonly NotificationDto[],
  incoming: NotificationDto,
  unreadNotifications: number,
  toastSeq: number,
  confirmedReadIds?: ReadonlySet<string>,
): LivePatch {
  if (notifications.some((item) => item.id === incoming.id)) {
    const existing = notifications.find((item) => item.id === incoming.id);
    const confirmed = confirmedReadIds?.has(incoming.id) ?? false;
    if (!existing || existing.read || (!incoming.read && !confirmed)) return { refresh: null };
    const stored = { ...existing, ...incoming, read: true };
    return {
      notifications: notifications.map((item) => (item.id === incoming.id ? stored : item)),
      unreadNotifications: Math.max(0, unreadNotifications - 1),
      refresh: null,
    };
  }
  const read = incoming.read || (confirmedReadIds?.has(incoming.id) ?? false);
  const stored = read && !incoming.read ? { ...incoming, read: true } : incoming;
  const social = stored.type === "FRIEND_REQUEST" || stored.type === "FRIEND_REQUEST_ACCEPTED";
  return {
    notifications: [stored, ...notifications],
    unreadNotifications: stored.read ? unreadNotifications : unreadNotifications + 1,
    toast: stored.message,
    toastSeq: toastSeq + 1,
    refresh: social ? "social" : stored.type === "NEW_MESSAGE" ? "conversations" : null,
  };
}
