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

/** One channel per message. `editor` is a VS Code popup. `desktop` is a native OS toast. */
export type NoticeChannel = "none" | "editor" | "desktop";

/** Foreground windows use the in-editor notice. Background windows use one native toast. */
export function noticeChannel(windowForeground: boolean): Exclude<NoticeChannel, "none"> {
  return windowForeground ? "editor" : "desktop";
}

/**
 * Whether this VS Code window is the app the user is looking at.
 * `focused` drops as soon as another application or the desktop is in front.
 * `active` only means the window was used recently, so it stays true after you leave.
 * A focused chat webview can clear `focused` while you are still inside VS Code.
 */
export function windowInForeground(
  windowFocused: boolean,
  windowActive: boolean | undefined,
  webviewFocused = false,
): boolean {
  if (windowActive === false) return false;
  if (windowFocused) return true;
  if (webviewFocused) return true;
  return false;
}

/** Foreground signal for a reading snapshot. Webview focus counts only while that view is open. */
export function readingIsForeground(reading: ReadingContext): boolean {
  return windowInForeground(reading.windowFocused, reading.windowActive, reading.viewVisible && reading.webviewFocused);
}

/** None while that thread is on screen. Otherwise exactly one channel. */
export function routeNotice(conversationOnScreen: boolean, vscodeForeground: boolean): NoticeChannel {
  if (conversationOnScreen) return "none";
  return noticeChannel(vscodeForeground);
}

/** Live signals for the one conversation whose thread is actually on screen. */
export interface ReadingContext {
  readonly windowFocused: boolean;
  readonly windowActive?: boolean;
  readonly viewVisible: boolean;
  readonly screen: string;
  readonly activeConversationId: string | null;
  /** Last conversation this webview instance reported. Null after dispose, sign-out, or before the first report. */
  readonly reportedConversationId: string | null;
  readonly webviewDocumentVisible: boolean;
  /** True when the chat webview document itself has focus. */
  readonly webviewFocused: boolean;
}

/**
 * True only when that conversation's thread is on screen in the foreground VS Code window.
 * A selected id, a hidden sidebar, or a background window does not count.
 * The host view's visibility is the source of truth. The webview document can report
 * itself hidden while the sidebar chat is still the screen the user is looking at.
 */
export function isActivelyReading(reading: ReadingContext, conversationId: string): boolean {
  if (!conversationId || !readingIsForeground(reading)) return false;
  if (!reading.viewVisible) return false;
  if (reading.screen !== "messages") return false;
  if (reading.activeConversationId !== conversationId) return false;
  return reading.reportedConversationId === conversationId;
}

export interface MessageNoticeInput {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderIsSelf: boolean;
  readonly senderBlocked: boolean;
  readonly reading: ReadingContext;
  readonly prefs: NoticePrefs;
  readonly seen: ReadonlySet<string>;
  readonly senderLabel?: string;
  readonly notificationId?: string;
}

export type NoticeReason = "self" | "blocked" | "duplicate" | "viewing" | "disabled" | "editor" | "desktop";

export interface MessageNoticeDecision {
  readonly channel: NoticeChannel;
  readonly target: NoticeTarget | null;
  /** Ids to remember when the notice is suppressed because the thread is already on screen. */
  readonly rememberIds: readonly string[];
  readonly reason: NoticeReason;
}

/** One routing decision for an incoming message. Recording is separate from delivery. */
export function resolveMessageNotice(input: MessageNoticeInput): MessageNoticeDecision {
  const none = (reason: NoticeReason, rememberIds: readonly string[] = []): MessageNoticeDecision => ({ channel: "none", target: null, rememberIds, reason });
  if (input.senderBlocked) return none("blocked");
  if (input.senderIsSelf) return none("self");
  if (input.seen.has(input.messageId)) return none("duplicate");
  const viewing = isActivelyReading(input.reading, input.conversationId);
  const channel = routeNotice(viewing, readingIsForeground(input.reading));
  if (channel === "none") {
    return none("viewing", input.notificationId ? [input.messageId, input.notificationId] : [input.messageId]);
  }
  if (!input.prefs.messages) return none("disabled");
  const target = decideMessageNotice(
    input.messageId,
    input.conversationId,
    false,
    false,
    input.prefs,
    input.seen,
    input.senderLabel ?? "Someone",
    input.notificationId,
  );
  if (!target) return none("disabled");
  return { channel, target, rememberIds: input.notificationId ? [input.notificationId] : [], reason: channel };
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
