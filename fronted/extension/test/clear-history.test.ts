import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/api/errors";
import type { AuthService } from "../src/extension/auth-service";
import { MemoryChatCache } from "../src/extension/chat-cache";
import { MemoryOutbox } from "../src/extension/outbox";
import { dropClearedNotifications, visibleAfterClear } from "../src/extension/realtime-state";
import { SessionFlow } from "../src/extension/session-flow";
import { emptyHostState, renderWebview } from "../src/extension/webview";

const me = { id: "u1", username: "ada", displayName: "Ada", accountType: "PUBLIC" as const, relationship: "SELF" as const };
const conversations = [
  { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" },
  { id: "c2", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u3"], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" },
];
const clearedAt = "2026-10-12T00:00:00.000Z";

function textMessage(id: string, conversationId: string, createdAt: string) {
  return {
    id,
    conversationId,
    senderId: "u2",
    recipientId: "u1",
    ciphertext: "e30=",
    messageType: "TEXT" as const,
    status: "SENT" as const,
    createdAt,
    displayText: "hello",
  };
}

function note(id: string, createdAt: string, read = false) {
  return {
    id,
    type: "NEW_MESSAGE" as const,
    referenceId: "c1",
    message: "New message",
    read,
    createdAt,
  };
}

function createFlow(options?: { failClear?: boolean; cache?: MemoryChatCache; offline?: boolean }) {
  const notes = [note("note-old", "2026-10-01T00:00:00.000Z")];
  const staleNotes = notes.map((item) => ({ ...item }));
  let serveStale = false;
  const history = {
    c1: [textMessage("m-old", "c1", "2026-10-01T00:00:00.000Z")],
    c2: [textMessage("m-other", "c2", "2026-10-01T00:00:00.000Z")],
  };
  const failClear = options?.failClear === true;
  const auth = {
    apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
    isAuthenticated: () => true,
    hasDeviceKeys: () => true,
    getUser: () => me,
    refreshProfile: async () => {
      if (options?.offline) throw new Error("offline");
    },
    loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
    listConversations: async () => conversations.map((item) => ({ ...item })),
    loadNotifications: async () => {
      const items = (serveStale ? staleNotes : notes).map((item) => ({ ...item }));
      return { items, unreadCount: items.filter((item) => !item.read).length };
    },
    blockedUsers: async () => [],
    ensureDeviceKeys: async () => undefined,
    lastRoute: () => options?.offline ? { screen: "messages", conversationId: "c1" } : undefined,
    rememberRoute: () => undefined,
    markConversationRead: async () => undefined,
    markNotificationRead: async (id: string) => {
      const found = notes.find((item) => item.id === id);
      if (found) found.read = true;
      return found ?? note(id, clearedAt, true);
    },
    blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
    openConversation: async (request: { conversationId?: string }) => {
      const id = request.conversationId ?? "c1";
      return {
        conversation: conversations.find((item) => item.id === id) ?? conversations[0],
        messages: [...(history[id as "c1" | "c2"] ?? [])],
        nextCursor: null,
        hasNext: false,
      };
    },
    loadOlderMessages: async () => ({ messages: [], nextCursor: null, hasNext: false }),
    displayMessage: (item: { id: string }) => ({ ...item, displayText: "hello" }),
    userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    clearNotifications: async () => {
      if (failClear) throw new ApiError("network", "Could not reach the DevConnect API.");
      const cleared = notes.length;
      notes.splice(0, notes.length);
      return { cleared, clearedAt };
    },
    clearConversation: async (conversationId: string) => {
      if (failClear) throw new ApiError("network", "Could not reach the DevConnect API.");
      if (conversationId === "c-outsider") throw new ApiError("http", "The requested item was not found.", 404);
      return clearedAt;
    },
  };
  return {
    flow: new SessionFlow(
      auth as unknown as AuthService,
      () => undefined,
      async () => undefined,
      () => undefined,
      new MemoryOutbox(),
      options?.cache ?? new MemoryChatCache(),
    ),
    notes,
    setStale(value: boolean) {
      serveStale = value;
    },
    addMessage(conversationId: "c1" | "c2", message: ReturnType<typeof textMessage>) {
      history[conversationId].push(message);
    },
  };
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("clear notifications and clear chat", () => {
  test("the notifications page and chat header expose the clear actions", () => {
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, emptyHostState());
    expect(html).toContain("Clear notifications");
    expect(html).toContain("Clear all notifications?");
    expect(html).toContain("This will remove all your notifications from your notification history. This action cannot be undone.");
    expect(html).toContain('aria-label="Chat options"');
    expect(html).toContain("Clear chat");
    expect(html).toContain("Clear this chat?");
    expect(html).toContain("Clear the messages in this conversation from your chat history? This action cannot be undone.");
    expect(html).toContain('id="dialog-cancel"');
    expect(html).not.toContain("window.alert");
  });

  test("a cleared notification stays gone when an older list or frame arrives, and a newer one appears", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    expect(harness.flow.snapshot().unreadNotifications).toBe(1);
    await harness.flow.handleMessage({ version: 1, type: "clearNotifications" });
    expect(harness.flow.snapshot().notifications).toEqual([]);
    expect(harness.flow.snapshot().unreadNotifications).toBe(0);

    harness.setStale(true);
    await harness.flow.handleMessage({ version: 1, type: "loadNotifications" });
    expect(harness.flow.snapshot().notifications).toEqual([]);
    expect(harness.flow.snapshot().unreadNotifications).toBe(0);

    harness.flow.ingestFrame({ type: "NOTIFICATION", data: note("note-old", "2026-10-01T00:00:00.000Z") });
    expect(harness.flow.snapshot().notifications).toEqual([]);
    harness.flow.ingestFrame({ type: "NOTIFICATION", data: note("note-new", "2026-10-12T00:00:01.000Z") });
    expect(harness.flow.snapshot().notifications.map((item) => item.id)).toEqual(["note-new"]);
    expect(harness.flow.snapshot().unreadNotifications).toBe(1);
  });

  test("a failed notification clear keeps the existing list", async () => {
    const harness = createFlow({ failClear: true });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "clearNotifications" });
    expect(harness.flow.snapshot().notifications.map((item) => item.id)).toEqual(["note-old"]);
    expect(harness.flow.snapshot().error).toBe("Could not reach the DevConnect API.");
  });

  test("clearing one chat hides only that history and keeps the conversation", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c2" });
    await settle();
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-other"]);
    await harness.flow.handleMessage({ version: 1, type: "clearChat", conversationId: "c1" });
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-other"]);
    expect(harness.flow.snapshot().conversations.map((item) => item.id)).toEqual(["c1", "c2"]);

    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual([]);
    expect(harness.flow.snapshot().activeConversationId).toBe("c1");

    harness.flow.ingestFrame({ type: "MESSAGE", data: textMessage("m-old", "c1", "2026-10-01T00:00:00.000Z") });
    expect(harness.flow.snapshot().messages).toEqual([]);
    harness.flow.ingestFrame({ type: "MESSAGE", data: textMessage("m-new", "c1", "2026-10-12T00:00:01.000Z") });
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-new"]);
    expect(harness.flow.snapshot().messages[0]?.ciphertext).toBe("e30=");
  });

  test("cancel is not required for a failed clear, which leaves the open chat untouched", async () => {
    const harness = createFlow({ failClear: true });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "clearChat", conversationId: "c1" });
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-old"]);
    expect(harness.flow.snapshot().error).toBe("Could not reach the DevConnect API.");
  });

  test("a repeated clear and a reload from cache do not bring the old messages back", async () => {
    const cache = new MemoryChatCache();
    const harness = createFlow({ cache });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "clearChat", conversationId: "c1" });
    await harness.flow.handleMessage({ version: 1, type: "clearChat", conversationId: "c1" });
    expect(harness.flow.snapshot().messages).toEqual([]);
    expect(cache.load("u1")?.clearedAt?.c1).toBe(clearedAt);
    expect(cache.load("u1")?.threads.c1).toBeUndefined();

    const restarted = createFlow({ cache, offline: true });
    await restarted.flow.bootstrap();
    expect(restarted.flow.snapshot().messages.map((item) => item.id)).toEqual([]);
    expect(restarted.flow.snapshot().activeConversationId).toBe("c1");
    expect(restarted.flow.snapshot().conversations.map((item) => item.id)).toEqual(["c1", "c2"]);
  });

  test("notification and message filters ignore cleared rows and keep newer ones", () => {
    const notes = [
      note("old", "2026-10-01T00:00:00.000Z"),
      note("new", "2026-10-12T00:00:01.000Z", true),
    ];
    expect(dropClearedNotifications(notes, clearedAt).map((item) => item.id)).toEqual(["new"]);
    expect(dropClearedNotifications(notes, null)).toHaveLength(2);
    const messages = [
      textMessage("local-1", "c1", "2026-10-01T00:00:00.000Z"),
      textMessage("old", "c1", "2026-10-01T00:00:00.000Z"),
      textMessage("new", "c1", "2026-10-12T00:00:01.000Z"),
    ];
    messages[0]!.id = "local-1";
    expect(visibleAfterClear(messages, clearedAt).map((item) => item.id)).toEqual(["local-1", "new"]);
  });
});
