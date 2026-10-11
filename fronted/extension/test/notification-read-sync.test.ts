import { describe, expect, test } from "bun:test";
import type { AuthService } from "../src/extension/auth-service";
import { acceptLiveToast } from "../src/extension/realtime-state";
import { isActivelyReading, noticeChannel, resolveMessageNotice } from "../src/extension/desktop-notice";
import { SessionFlow } from "../src/extension/session-flow";

const me = { id: "u1", username: "ada", displayName: "Ada", accountType: "PUBLIC" as const, relationship: "SELF" as const };
const conversation = { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"] };

type Note = {
  id: string;
  type: "NEW_MESSAGE" | "FRIEND_REQUEST";
  referenceId: string;
  message: string;
  read: boolean;
};

function messageFrame(id: string, conversationId: string) {
  return {
    type: "MESSAGE",
    data: {
      id,
      conversationId,
      senderId: "u2",
      recipientId: "u1",
      ciphertext: "e30=",
      messageType: "TEXT",
      status: "SENT",
    },
  };
}

function noteFrame(note: Note) {
  return { type: "NOTIFICATION", data: note };
}

function createFlow(initial: Note[] = [], route?: { screen: string; conversationId: string | null }) {
  const notes = initial.map((note) => ({ ...note }));
  const marked: string[] = [];
  const conversationReads: string[] = [];
  let serveStale = false;
  let held: Promise<void> | null = null;
  let releaseHold: (() => void) | undefined;
  const auth = {
    apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
    isAuthenticated: () => true,
    hasDeviceKeys: () => true,
    getUser: () => me,
    refreshProfile: async () => undefined,
    loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
    listConversations: async () => [conversation],
    loadNotifications: async () => {
      if (held) {
        const waiting = held;
        held = null;
        await waiting;
      }
      const items = notes.map((note) => ({
        ...note,
        read: serveStale && note.id === "note-a" ? false : note.read,
      }));
      return { items, unreadCount: items.filter((note) => !note.read).length };
    },
    blockedUsers: async () => [],
    ensureDeviceKeys: async () => undefined,
    lastRoute: () => route,
    rememberRoute: () => undefined,
    markConversationRead: async (conversationId: string) => {
      conversationReads.push(conversationId);
    },
    markNotificationRead: async (id: string) => {
      const found = notes.find((note) => note.id === id);
      if (!found) throw new Error(`unknown notification ${id}`);
      found.read = true;
      marked.push(id);
      return { ...found };
    },
    blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
    openConversation: async (options: { conversationId?: string }) => ({
      conversation: { ...conversation, id: options.conversationId ?? conversation.id },
      messages: [],
    }),
    displayMessage: (item: { id: string }) => ({ ...item, displayText: "hello" }),
    userFacingError: () => "Something went wrong. Try again.",
  };
  return {
    flow: new SessionFlow(auth as unknown as AuthService, () => undefined),
    notes,
    marked,
    conversationReads,
    setStale(value: boolean) {
      serveStale = value;
    },
    holdNextLoad() {
      held = new Promise((resolve) => {
        releaseHold = resolve;
      });
    },
    releaseLoad() {
      releaseHold?.();
      releaseHold = undefined;
    },
  };
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const other = {
  id: "note-b",
  type: "NEW_MESSAGE" as const,
  referenceId: "c2",
  message: "You received a new encrypted message",
  read: false,
};
const friend = {
  id: "note-friend",
  type: "FRIEND_REQUEST" as const,
  referenceId: "req-1",
  message: "Rahul sent you a friend request",
  read: false,
};
const activeNote = {
  id: "note-a",
  type: "NEW_MESSAGE" as const,
  referenceId: "c1",
  message: "You received a new encrypted message",
  read: false,
};

describe("notification read sync", () => {
  test("a message in the open conversation is shown, marked read, and its notification is not left unread", async () => {
    const harness = createFlow([other, friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    harness.flow.ingestFrame(messageFrame("m1", "c1"));
    harness.notes.unshift({ ...activeNote });
    harness.flow.ingestFrame(noteFrame(activeNote));
    await settle();

    expect(harness.flow.snapshot().messages.some((item) => item.id === "m1")).toBe(true);
    expect(harness.conversationReads).toContain("c1");
    expect(harness.marked).toEqual(["note-a"]);
    expect(harness.marked).not.toContain("m1");
    const state = harness.flow.snapshot();
    expect(state.notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(state.notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(state.notifications.find((note) => note.id === "note-friend")?.read).toBe(false);
    expect(state.unreadNotifications).toBe(2);
    expect(state.toast).toBeNull();
  });

  test("a message in another conversation keeps its notification unread", async () => {
    const harness = createFlow([other, friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    const markedBefore = harness.marked.length;
    harness.flow.ingestFrame(messageFrame("m2", "c2"));
    harness.flow.ingestFrame(noteFrame({ ...other, id: "note-b2" }));
    harness.notes.unshift({ ...other, id: "note-b2" });
    await settle();

    expect(harness.marked.slice(markedBefore)).toEqual([]);
    expect(harness.conversationReads).not.toContain("c2");
    const state = harness.flow.snapshot();
    expect(state.notifications.find((note) => note.id === "note-b2")?.read).toBe(false);
    expect(state.notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(state.toast).toBeNull();
  });

  test("opening a conversation marks only that conversation's existing message notifications", async () => {
    const older = { ...activeNote, id: "note-a-old" };
    const harness = createFlow([older, activeNote, other, friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();

    expect(harness.marked.slice().sort()).toEqual(["note-a", "note-a-old"]);
    const state = harness.flow.snapshot();
    expect(state.notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(state.notifications.find((note) => note.id === "note-a-old")?.read).toBe(true);
    expect(state.notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(state.notifications.find((note) => note.id === "note-friend")?.read).toBe(false);
    expect(state.unreadNotifications).toBe(2);
  });

  test("a notification that arrives after the read receipt is still marked read", async () => {
    const harness = createFlow([other]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    harness.flow.ingestFrame(messageFrame("m1", "c1"));
    await settle();
    expect(harness.conversationReads).toContain("c1");
    expect(harness.marked).toEqual([]);

    harness.notes.unshift({ ...activeNote });
    harness.flow.ingestFrame(noteFrame(activeNote));
    await settle();
    expect(harness.marked).toEqual(["note-a"]);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-b")?.read).toBe(false);
  });

  test("a replayed notification frame does not restore unread", async () => {
    const harness = createFlow([activeNote, other]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    const reads = harness.marked.length;
    harness.flow.ingestFrame(noteFrame(activeNote));
    harness.flow.ingestFrame(noteFrame(activeNote));
    harness.flow.ingestFrame(messageFrame("m1", "c1"));
    harness.flow.ingestFrame(messageFrame("m1", "c1"));
    await settle();

    expect(harness.marked.filter((id) => id === "note-a")).toHaveLength(1);
    expect(harness.marked).toHaveLength(reads);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(harness.flow.snapshot().unreadNotifications).toBe(1);
  });

  test("a reconnect and a notification refresh keep a confirmed read", async () => {
    const harness = createFlow([activeNote, other, friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    harness.setStale(true);
    await harness.flow.handleMessage({ version: 1, type: "loadNotifications" });
    harness.flow.setConnection("connected", true);
    await settle();

    const state = harness.flow.snapshot();
    expect(state.notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(state.notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(state.notifications.find((note) => note.id === "note-friend")?.read).toBe(false);
    expect(state.unreadNotifications).toBe(2);
    expect(state.screen).toBe("messages");
  });

  test("leaving the conversation before the notification lookup finishes does not mark it read", async () => {
    const harness = createFlow([friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    harness.holdNextLoad();
    harness.flow.ingestFrame(messageFrame("m1", "c1"));
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c2" });
    harness.notes.unshift({ ...activeNote });
    harness.releaseLoad();
    await settle();

    expect(harness.marked).not.toContain("note-a");
    expect(harness.flow.snapshot().activeConversationId).toBe("c2");
    expect(harness.notes.find((note) => note.id === "note-a")?.read).toBe(false);
  });

  test("reopening the same conversation after a reload marks its saved message notifications", async () => {
    const harness = createFlow([activeNote, other, friend], { screen: "messages", conversationId: "c1" });
    await harness.flow.bootstrap();
    await settle();

    expect(harness.flow.snapshot().activeConversationId).toBe("c1");
    expect(harness.flow.snapshot().screen).toBe("messages");
    expect(harness.marked).toEqual(["note-a"]);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-friend")?.read).toBe(false);
  });

  test("a refresh that was already running cannot make a confirmed read unread again", async () => {
    const harness = createFlow([activeNote, other, friend]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-a")?.read).toBe(true);

    harness.holdNextLoad();
    harness.setStale(true);
    harness.flow.setConnection("connecting", false);
    harness.flow.setConnection("connected", true);
    harness.flow.ingestFrame(noteFrame(activeNote));
    harness.flow.ingestFrame(noteFrame(activeNote));
    harness.releaseLoad();
    await settle();

    const state = harness.flow.snapshot();
    expect(state.notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(state.notifications.find((note) => note.id === "note-b")?.read).toBe(false);
    expect(state.notifications.find((note) => note.id === "note-friend")?.read).toBe(false);
    expect(state.unreadNotifications).toBe(2);
    await harness.flow.handleMessage({ version: 1, type: "loadNotifications" });
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-a")?.read).toBe(true);
    expect(harness.flow.snapshot().unreadNotifications).toBe(2);
  });

  test("message notices stay on the host channel and friend requests still toast in the view", async () => {
    expect(acceptLiveToast({ type: "NEW_MESSAGE" })).toBe(false);
    expect(acceptLiveToast({ type: "FRIEND_REQUEST" })).toBe(true);
    const reading = {
      windowFocused: true,
      windowActive: true,
      viewVisible: true,
      webviewDocumentVisible: true,
      webviewFocused: true,
      screen: "messages",
      activeConversationId: "c1",
      reportedConversationId: "c1",
    };
    expect(isActivelyReading(reading, "c1")).toBe(true);
    expect(resolveMessageNotice({
      messageId: "m1",
      conversationId: "c1",
      senderIsSelf: false,
      senderBlocked: false,
      senderLabel: "Rahul",
      prefs: { messages: true, friendRequests: true, friendAccepted: true },
      reading,
      seen: new Set(),
    }).channel).toBe("none");
    expect(noticeChannel(true)).toBe("editor");
    expect(noticeChannel(false)).toBe("desktop");

    const harness = createFlow([other]);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    harness.flow.ingestFrame(noteFrame(friend));
    expect(harness.flow.snapshot().toast).toBe(friend.message);
    expect(harness.flow.snapshot().notifications.find((note) => note.id === "note-b")?.read).toBe(false);
  });
});
