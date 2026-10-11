import { describe, expect, test } from "bun:test";
import { decideMessageNotice, decideNotificationNotice, decideStoredNotice, isActivelyReading, noticeChannel, noticeLaunchUri, resolveMessageNotice, routeNotice, unreadMessageNotificationId, windowInForeground, type ReadingContext } from "../src/extension/desktop-notice";
import { acceptLiveToast, mergeLiveMessage, mergeReceipt } from "../src/extension/realtime-state";

const prefs = { messages: true, friendRequests: true, friendAccepted: true };

function reading(overrides: Partial<ReadingContext> = {}): ReadingContext {
  return {
    windowFocused: true,
    windowActive: true,
    viewVisible: true,
    screen: "messages",
    activeConversationId: "c1",
    reportedConversationId: "c1",
    webviewDocumentVisible: true,
    webviewFocused: false,
    ...overrides,
  };
}

function noticeFor(
  conversationId: string,
  messageId: string,
  context: ReadingContext,
  seen: Set<string>,
  options: { senderIsSelf?: boolean; senderBlocked?: boolean; senderLabel?: string; notificationId?: string } = {},
) {
  const decision = resolveMessageNotice({
    messageId,
    conversationId,
    senderIsSelf: options.senderIsSelf ?? false,
    senderBlocked: options.senderBlocked ?? false,
    reading: context,
    prefs,
    seen,
    senderLabel: options.senderLabel,
    notificationId: options.notificationId,
  });
  for (const id of decision.rememberIds) seen.add(id);
  if (decision.target) seen.add(decision.target.id);
  return decision.target;
}

describe("desktop notices", () => {
  test("skips a message the user is already reading and a duplicate id", () => {
    const seen = new Set<string>();
    expect(decideMessageNotice("m1", "c1", false, true, prefs, seen)).toBeNull();
    const first = decideMessageNotice("m1", "c1", false, false, prefs, seen, "shaikn");
    expect(first?.action).toBe("Open message");
    expect(first?.body).toBe("shaikn sent you a message");
    expect(first?.conversationId).toBe("c1");
    expect(first?.notificationId).toBeUndefined();
    const linked = decideMessageNotice("m9", "c1", false, false, prefs, seen, "Rahul", "note-9");
    expect(linked?.notificationId).toBe("note-9");
    expect(linked?.action).toBe("Open message");
    seen.add("m1");
    expect(decideMessageNotice("m1", "c1", false, false, prefs, seen)).toBeNull();
    expect(decideMessageNotice("m2", "c1", true, false, prefs, seen)).toBeNull();
  });

  test("routes friend requests and does not double-notify a new message", () => {
    const seen = new Set<string>();
    const request = decideNotificationNotice({
      id: "n1",
      type: "FRIEND_REQUEST",
      message: "Rahul sent you a friend request",
      read: false,
    }, prefs, seen);
    expect(request?.screen).toBe("friends");
    expect(request?.action).toBe("View request");
    expect(decideNotificationNotice({
      id: "n2",
      type: "NEW_MESSAGE",
      message: "You received a new encrypted message",
      read: false,
    }, prefs, seen)).toBeNull();
    expect(decideNotificationNotice({
      id: "n1",
      type: "FRIEND_REQUEST",
      message: "Rahul sent you a friend request",
      read: false,
    }, { ...prefs, friendRequests: false }, seen)).toBeNull();
    const accepted = decideNotificationNotice({
      id: "n3",
      type: "FRIEND_REQUEST_ACCEPTED",
      actorId: "user-2",
      message: "Rahul accepted your friend request",
      read: false,
    }, prefs, seen);
    expect(accepted?.action).toBe("View profile");
    expect(accepted?.screen).toBe("user");
    expect(accepted?.userId).toBe("user-2");
    expect(decideNotificationNotice({
      id: "n4",
      type: "FRIEND_REQUEST_ACCEPTED",
      actorId: "user-2",
      message: "Rahul accepted your friend request",
      read: false,
    }, { ...prefs, friendAccepted: false }, seen)).toBeNull();
    expect(request?.friendsPanel).toBe("requests");
    expect(request?.notificationId).toBe("n1");
    expect(accepted?.notificationId).toBe("n3");
  });

  test("keeps the unread message notification id for the open conversation", () => {
    const notes = [
      { id: "old", type: "NEW_MESSAGE", referenceId: "c1", read: true },
      { id: "live", type: "NEW_MESSAGE", referenceId: "c1", read: false },
      { id: "other", type: "FRIEND_REQUEST", referenceId: "c1", read: false },
    ];
    expect(unreadMessageNotificationId(notes, "c1")).toBe("live");
    expect(unreadMessageNotificationId(notes, "c2")).toBeUndefined();
  });

  test("notifies when VS Code is unfocused, minimized, or the sidebar is closed", () => {
    const open = reading({ reportedConversationId: "c1" });
    expect(isActivelyReading(open, "c1")).toBe(true);
    expect(isActivelyReading(reading({ windowFocused: false, windowActive: false, webviewFocused: false, reportedConversationId: "c1" }), "c1")).toBe(false);
    expect(isActivelyReading(reading({ viewVisible: false, reportedConversationId: "c1" }), "c1")).toBe(false);
    expect(isActivelyReading(open, "c2")).toBe(false);
    expect(noticeChannel(true)).toBe("editor");
    expect(noticeChannel(false)).toBe("desktop");
    expect(routeNotice(true, true)).toBe("none");
    expect(routeNotice(true, false)).toBe("none");
    expect(routeNotice(false, true)).toBe("editor");
    expect(routeNotice(false, false)).toBe("desktop");
    expect(windowInForeground(false, true)).toBe(true);
    expect(windowInForeground(false, false)).toBe(false);
    expect(windowInForeground(false, undefined)).toBe(false);
    expect(windowInForeground(true, undefined)).toBe(true);
    const prefs = { messages: true, friendRequests: true, friendAccepted: true };
    const stored = decideStoredNotice({
      id: "n9",
      type: "NEW_MESSAGE",
      referenceId: "c1",
      message: "You received a new encrypted message",
      read: false,
    }, prefs, new Set(), false);
    expect(stored?.action).toBe("Open message");
    expect(stored?.notificationId).toBe("n9");
    expect(stored?.body).not.toContain("secret");
    expect(decideStoredNotice({
      id: "n9",
      type: "NEW_MESSAGE",
      referenceId: "c1",
      message: "You received a new encrypted message",
      read: false,
    }, prefs, new Set(), true)).toBeNull();
    const launch = noticeLaunchUri("Bannysukumar2255", "devconnect-vscode-extension", {
      screen: "messages",
      notificationId: "n9",
      conversationId: "c1",
    });
    expect(launch).toContain("notificationId=n9");
    expect(launch).toContain("conversationId=c1");
    expect(launch).not.toMatch(/Bearer|eyJ/);
  });

  test("suppresses a desktop notice only for the conversation on screen", () => {
    const seen = new Set<string>();
    const viewingA = reading();
    expect(noticeFor("c1", "m-a", viewingA, seen, { senderLabel: "Ada" })).toBeNull();
    expect(seen.has("m-a")).toBe(true);
    const other = noticeFor("c2", "m-b", viewingA, seen, { senderLabel: "Grace" });
    expect(other?.conversationId).toBe("c2");
    expect(other?.body).toBe("Grace sent you a message");
    const switched = reading({ activeConversationId: "c2", reportedConversationId: "c2" });
    expect(noticeFor("c1", "m-c", switched, seen, { senderLabel: "Ada" })?.conversationId).toBe("c1");
    const inbox = reading({ screen: "home", activeConversationId: "c1", reportedConversationId: "c1" });
    expect(noticeFor("c1", "m-d", inbox, seen)?.screen).toBe("messages");
    const switching = reading({ activeConversationId: "c2", reportedConversationId: "c1" });
    expect(isActivelyReading(switching, "c1")).toBe(false);
    expect(isActivelyReading(switching, "c2")).toBe(false);
    const hidden = reading({ viewVisible: false, webviewDocumentVisible: false });
    expect(noticeFor("c1", "m-e", hidden, seen)).not.toBeNull();
    const background = reading({ windowFocused: false, windowActive: false, webviewFocused: false, webviewDocumentVisible: true });
    expect(noticeFor("c1", "m-f", background, seen)).not.toBeNull();
    expect(resolveMessageNotice({
      messageId: "m-f2",
      conversationId: "c1",
      senderIsSelf: false,
      senderBlocked: false,
      reading: background,
      prefs,
      seen,
    }).channel).toBe("desktop");
    const focusedChat = reading({ windowFocused: false, windowActive: false, webviewFocused: true, webviewDocumentVisible: false });
    const first = resolveMessageNotice({
      messageId: "m-focus",
      conversationId: "c1",
      senderIsSelf: false,
      senderBlocked: false,
      reading: focusedChat,
      prefs,
      seen,
      notificationId: "note-focus",
    });
    expect(first.channel).toBe("none");
    expect(first.reason).toBe("viewing");
    for (const id of first.rememberIds) seen.add(id);
    const replay = resolveMessageNotice({
      messageId: "m-focus",
      conversationId: "c1",
      senderIsSelf: false,
      senderBlocked: false,
      reading: focusedChat,
      prefs,
      seen,
      notificationId: "note-focus",
    });
    expect(replay.channel).toBe("none");
    expect(replay.reason).toBe("duplicate");
    expect(resolveMessageNotice({
      messageId: "m-other",
      conversationId: "c2",
      senderIsSelf: false,
      senderBlocked: false,
      reading: focusedChat,
      prefs,
      seen,
    }).channel).toBe("editor");
    const webviewInsideForeground = reading({ windowFocused: false, windowActive: true, webviewFocused: true });
    expect(noticeFor("c1", "m-g", webviewInsideForeground, seen)).toBeNull();
    const otherWhileAway = reading({ windowFocused: false, windowActive: false, activeConversationId: "c1", reportedConversationId: "c1" });
    expect(resolveMessageNotice({
      messageId: "m-b-away",
      conversationId: "c2",
      senderIsSelf: false,
      senderBlocked: false,
      reading: otherWhileAway,
      prefs,
      seen,
    }).channel).toBe("desktop");
    const friends = reading({ screen: "friends", activeConversationId: null, reportedConversationId: null, windowFocused: true, windowActive: true });
    expect(resolveMessageNotice({
      messageId: "m-friends",
      conversationId: "c1",
      senderIsSelf: false,
      senderBlocked: false,
      reading: friends,
      prefs,
      seen,
    }).channel).toBe("editor");
  });

  test("shows one notice when the same message arrives twice, then allows a later message", () => {
    const seen = new Set<string>();
    const away = reading({ screen: "friends", activeConversationId: "c1", reportedConversationId: null });
    const first = noticeFor("c1", "m1", away, seen, { notificationId: "n1" });
    expect(first?.id).toBe("m1");
    expect(noticeFor("c1", "m1", away, seen, { notificationId: "n1" })).toBeNull();
    expect(noticeFor("c1", "m2", away, seen)?.id).toBe("m2");
  });

  test("tracks the open conversation again after a webview reload and clears it on sign-out", () => {
    const seen = new Set<string>();
    const reloading = reading({ reportedConversationId: null, webviewDocumentVisible: false });
    expect(isActivelyReading(reloading, "c1")).toBe(false);
    expect(noticeFor("c1", "during-reload", reloading, seen)).not.toBeNull();
    const restored = reading({ reportedConversationId: "c1", webviewDocumentVisible: true });
    expect(noticeFor("c1", "after-reload", restored, seen)).toBeNull();
    const signedOut = reading({
      screen: "login",
      activeConversationId: null,
      reportedConversationId: null,
      webviewDocumentVisible: false,
      webviewFocused: false,
      viewVisible: false,
    });
    expect(isActivelyReading(signedOut, "c1")).toBe(false);
    expect(noticeFor("c1", "after-signout", signedOut, seen)).not.toBeNull();
  });

  test("still notifies for a different person and stays quiet for a blocked sender", () => {
    const seen = new Set<string>();
    const viewingA = reading();
    const other = noticeFor("c2", "from-other", viewingA, seen, { senderLabel: "Grace" });
    expect(other?.body).toBe("Grace sent you a message");
    expect(other?.body).not.toContain("ciphertext");
    const blocked = noticeFor("c2", "from-blocked", viewingA, seen, { senderBlocked: true, senderLabel: "hidden-plaintext" });
    expect(blocked).toBeNull();
    expect(JSON.stringify(blocked)).not.toContain("hidden-plaintext");
  });

  test("keeps the open chat message and its read receipt when the desktop notice is suppressed", () => {
    const incoming = {
      id: "m1",
      conversationId: "c1",
      senderId: "bob",
      recipientId: "ada",
      ciphertext: "e30=",
      messageType: "TEXT" as const,
      status: "SENT" as const,
    };
    const patch = mergeLiveMessage([], incoming, "c1", "ada", 0);
    expect(patch.messages?.[0]?.id).toBe("m1");
    expect(patch.bumpConversation).toBeUndefined();
    const other = mergeLiveMessage([], { ...incoming, id: "m2", conversationId: "c2" }, "c1", "ada", 0);
    expect(other.bumpConversation).toBe("c2");
    expect(other.messages).toBeUndefined();
    const read = mergeReceipt(patch.messages ?? [], { type: "READ", data: { messageId: "m1" } });
    expect(read?.[0]?.status).toBe("READ");
    expect(noticeFor("c1", "m1", reading(), new Set())).toBeNull();
    expect(acceptLiveToast({ type: "NEW_MESSAGE", referenceId: "c1" }, "messages", "c1")).toBe(false);
    expect(acceptLiveToast({ type: "NEW_MESSAGE", referenceId: "c2" }, "messages", "c1")).toBe(false);
    expect(acceptLiveToast({ type: "FRIEND_REQUEST", referenceId: "c1" }, "messages", "c1")).toBe(true);
  });
});