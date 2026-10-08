import type { NotificationDto } from "../shared/api-types";

export interface NoticePrefs {
  readonly messages: boolean;
  readonly friendRequests: boolean;
  readonly friendAccepted: boolean;
}

export interface NoticeTarget {
  readonly id: string;
  readonly body: string;
  readonly action: "Open message" | "View request" | "View profile";
  readonly screen: "messages" | "friends" | "user" | "notifications";
  readonly conversationId?: string;
  readonly notificationId?: string;
  readonly userId?: string;
  readonly friendsPanel?: "requests";
}

export function decideMessageNotice(
  messageId: string,
  conversationId: string,
  senderIsSelf: boolean,
  viewingThisConversation: boolean,
  prefs: NoticePrefs,
  seen: ReadonlySet<string>,
  senderLabel = "Someone",
): NoticeTarget | null {
  if (senderIsSelf || seen.has(messageId) || !prefs.messages || viewingThisConversation) return null;
  const name = senderLabel.trim() || "Someone";
  return {
    id: messageId,
    body: `${name} sent you a message`,
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
    return { id: note.id, body: note.message, action: "View request", screen: "friends", notificationId: note.id, friendsPanel: "requests" };
  }
  if (note.type === "FRIEND_REQUEST_ACCEPTED" && prefs.friendAccepted) {
    return {
      id: note.id,
      body: note.message,
      action: "View profile",
      screen: note.actorId ? "user" : "notifications",
      notificationId: note.id,
      userId: note.actorId ?? undefined,
    };
  }
  return null;
}
