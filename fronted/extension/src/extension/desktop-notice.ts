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

export function noticeLaunchUri(
  publisher: string,
  extensionName: string,
  target: Pick<NoticeTarget, "screen" | "notificationId" | "conversationId" | "userId" | "friendsPanel">,
): string {
  const params = new URLSearchParams();
  params.set("screen", target.screen);
  if (target.notificationId) params.set("notificationId", target.notificationId);
  if (target.conversationId) params.set("conversationId", target.conversationId);
  if (target.userId) params.set("userId", target.userId);
  if (target.friendsPanel) params.set("friendsPanel", target.friendsPanel);
  return `vscode://${publisher}.${extensionName}/notice?${params.toString()}`;
}

export function unreadMessageNotificationId(
  notifications: readonly { id: string; type: string; referenceId?: string | null; read: boolean }[],
  conversationId: string,
): string | undefined {
  return notifications.find((note) => note.type === "NEW_MESSAGE" && !note.read && note.referenceId === conversationId)?.id;
}

/** Focused windows use the in-editor notice. Background windows use one Windows toast. */
export function noticeChannel(windowFocused: boolean): "desktop" | "editor" {
  return windowFocused ? "editor" : "desktop";
}

/** True only while this window is focused and that conversation is on screen. */
export function isActivelyReading(
  windowFocused: boolean,
  viewVisible: boolean,
  openConversationId: string | null,
  conversationId: string,
): boolean {
  return windowFocused && viewVisible && openConversationId === conversationId;
}

export function decideStoredNotice(
  note: NotificationDto,
  prefs: NoticePrefs,
  seen: ReadonlySet<string>,
  activelyReading: boolean,
): NoticeTarget | null {
  if (note.read || seen.has(note.id)) return null;
  if (note.type === "NEW_MESSAGE") {
    if (!prefs.messages || activelyReading || !note.referenceId) return null;
    return {
      id: note.id,
      body: note.message,
      action: "Open message",
      screen: "messages",
      conversationId: note.referenceId,
      notificationId: note.id,
    };
  }
  return decideNotificationNotice(note, prefs, seen);
}

export function decideMessageNotice(
  messageId: string,
  conversationId: string,
  senderIsSelf: boolean,
  viewingThisConversation: boolean,
  prefs: NoticePrefs,
  seen: ReadonlySet<string>,
  senderLabel = "Someone",
  notificationId?: string,
): NoticeTarget | null {
  if (senderIsSelf || seen.has(messageId) || !prefs.messages || viewingThisConversation) return null;
  const name = senderLabel.trim() || "Someone";
  return {
    id: messageId,
    body: `${name} sent you a message`,
    action: "Open message",
    screen: "messages",
    conversationId,
    notificationId,
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
