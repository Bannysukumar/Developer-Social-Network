import type { NotificationDto } from "../shared/api-types";

export interface NoticePrefs {
  readonly messages: boolean;
  readonly friendRequests: boolean;
  readonly friendAccepted: boolean;
}

export interface NoticeTarget {
  readonly id: string;
  readonly body: string;
  readonly action: "Open message" | "View request" | "Open";
  readonly screen: "messages" | "friends" | "notifications";
  readonly conversationId?: string;
  readonly notificationId?: string;
}

export function decideMessageNotice(
  messageId: string,
  conversationId: string,
  senderIsSelf: boolean,
  viewingThisConversation: boolean,
  prefs: NoticePrefs,
  seen: ReadonlySet<string>,
): NoticeTarget | null {
  if (senderIsSelf || seen.has(messageId) || !prefs.messages || viewingThisConversation) return null;
  return {
    id: messageId,
    body: "You have a new message",
    action: "Open message",
    screen: "messages",
    conversationId,
  };
}

export function decideNotificationNotice(
  note: NotificationDto,
  prefs: NoticePrefs,
  seen: ReadonlySet<string>,
): NoticeTarget | null {
  if (seen.has(note.id) || note.type === "NEW_MESSAGE") return null;
  if (note.type === "FRIEND_REQUEST" && prefs.friendRequests) {
    return { id: note.id, body: note.message, action: "View request", screen: "friends", notificationId: note.id };
  }
  if (note.type === "FRIEND_REQUEST_ACCEPTED" && prefs.friendAccepted) {
    return { id: note.id, body: note.message, action: "Open", screen: "notifications", notificationId: note.id };
  }
  return null;
}
