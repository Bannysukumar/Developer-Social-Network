import { describe, expect, test } from "bun:test";
import type { AuthService } from "../src/extension/auth-service";
import { chatMenuMarkup } from "../src/extension/chat-menu";
import { SessionFlow } from "../src/extension/session-flow";
import { emptyHostState, renderWebview } from "../src/extension/webview";

const me = { id: "u1", username: "ada", displayName: "Ada", accountType: "PUBLIC" as const, relationship: "SELF" as const };
const conversation = { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"], peerDisplayName: "Grace", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };
const other = { ...conversation, id: "c2", participantIds: ["u1", "u3"], peerDisplayName: "Lin" };

function textMessage(id: string, conversationId: string, text: string, createdAt: string) {
  return {
    id,
    conversationId,
    senderId: "u2",
    recipientId: "u1",
    ciphertext: "e30=",
    messageType: "TEXT" as const,
    status: "READ" as const,
    createdAt,
    displayText: text,
  };
}

function createFlow(options?: {
  scan?: () => Promise<{ messages: ReturnType<typeof textMessage>[]; complete: boolean }>;
  older?: () => Promise<{ messages: ReturnType<typeof textMessage>[]; nextCursor: string | null; hasNext: boolean }>;
  download?: () => Promise<Uint8Array>;
}) {
  const saved: { name: string; bytes: Uint8Array }[] = [];
  let scans = 0;
  const auth = {
    apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
    isAuthenticated: () => true,
    hasDeviceKeys: () => true,
    getUser: () => me,
    refreshProfile: async () => undefined,
    loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
    listConversations: async () => [conversation, other],
    loadNotifications: async () => ({ items: [], unreadCount: 0 }),
    blockedUsers: async () => [],
    ensureDeviceKeys: async () => undefined,
    lastRoute: () => undefined,
    rememberRoute: () => undefined,
    markConversationRead: async () => undefined,
    markNotificationRead: async () => undefined,
    blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
    logout: async () => undefined,
    clearConversation: async () => "2026-10-11T12:00:00.000Z",
    userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    openConversation: async (input: { conversationId?: string }) => ({
      conversation: input.conversationId === "c2" ? other : conversation,
      messages: [textMessage(input.conversationId === "c2" ? "c2-m" : "m-new", input.conversationId === "c2" ? "c2" : "c1", "visible", "2026-10-12T00:00:00.000Z")],
      nextCursor: "page-2",
      hasNext: true,
    }),
    displayMessage: (item: { id: string; conversationId: string; createdAt?: string }) => ({
      ...item,
      displayText: item.id === "m-live" ? "fresh diagram" : "visible",
      attachments: item.id === "m-live" ? [{ id: "live-file", name: "diagram.png", size: 8, mime: "image/png", key: "key", iv: "iv" }] : undefined,
    }),
    scanHistory: async (conversationId: string) => {
      scans += 1;
      if (options?.scan) return options.scan();
      return {
        complete: true,
        messages: [
          textMessage("m-old", conversationId, "before clear", "2026-10-01T00:00:00.000Z"),
          textMessage("m-new", conversationId, "Hello C++", "2026-10-12T00:00:00.000Z"),
          textMessage("m-other", "c-other", "secret from elsewhere", "2026-10-12T00:00:00.000Z"),
          {
            ...textMessage("m-file", conversationId, "notes", "2026-10-12T01:00:00.000Z"),
            attachments: [{ id: "doc-1", name: "notes.pdf", size: 20, mime: "application/pdf", key: "key", iv: "iv" }],
          },
          {
            ...textMessage("m-photo", conversationId, "", "2026-10-12T02:00:00.000Z"),
            attachments: [{ id: "photo-1", name: "shot.gif", size: 20, mime: "image/gif", key: "key", iv: "iv" }],
          },
        ],
      };
    },
    loadOlderMessages: async () => options?.older?.() ?? {
      messages: [textMessage("m-paged", "c1", "older page", "2026-10-10T00:00:00.000Z")],
      nextCursor: null,
      hasNext: false,
    },
    downloadAttachment: async () => options?.download?.() ?? new Uint8Array([1, 2, 3]),
  };
  return {
    scans: () => scans,
    saved,
    flow: new SessionFlow(auth as unknown as AuthService, () => undefined, async (name, bytes) => {
      saved.push({ name, bytes });
    }),
  };
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("chat library", () => {
  test("the chat menu offers search, media, and docs with the existing actions", () => {
    const markup = chatMenuMarkup("block");
    expect(markup.indexOf('data-act="menu-search"')).toBeGreaterThan(-1);
    expect(markup.indexOf('data-act="menu-search"')).toBeLessThan(markup.indexOf('data-act="menu-media"'));
    expect(markup.indexOf('data-act="menu-media"')).toBeLessThan(markup.indexOf('data-act="menu-docs"'));
    expect(markup.indexOf('data-act="menu-docs"')).toBeLessThan(markup.indexOf('data-act="clear-chat"'));
    expect(markup.indexOf('data-act="clear-chat"')).toBeLessThan(markup.indexOf('data-act="menu-block"'));
    expect(markup).not.toContain("Unblock user");
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, {
      ...emptyHostState(),
      screen: "messages",
      authenticated: true,
      user: me,
      conversations: [conversation],
      activeConversationId: "c1",
    });
    expect(html).toContain("object-fit: cover");
    expect(html).toContain("aspect-ratio: 1");
    expect(html).toContain('type: "openLibrary"');
    expect(html).toContain("250");
    expect(html).not.toMatch(/https?:\/\//i);
  });

  test("search uses decrypted history for this conversation and respects a cleared boundary", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "search" });
    const library = harness.flow.snapshot().library;
    expect(harness.scans()).toBe(1);
    expect(library.map((item) => item.id)).not.toContain("m-other");
    expect(library.map((item) => item.text)).toContain("Hello C++");
    expect(library.some((item) => item.files.some((file) => file.bucket === "gif"))).toBe(true);
    expect(library.some((item) => item.files.some((file) => file.bucket === "file" && file.name === "notes.pdf"))).toBe(true);
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-new"]);

    await harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "docs" });
    expect(harness.scans()).toBe(1);

    await harness.flow.handleMessage({ version: 1, type: "clearChat", conversationId: "c1" });
    await harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "search" });
    expect(harness.flow.snapshot().library.map((item) => item.text)).not.toContain("before clear");
    expect(harness.flow.snapshot().library.map((item) => item.text)).toContain("Hello C++");
    expect(harness.flow.snapshot().messageLock).toBe("none");
  });

  test("a failed scan leaves the open chat in place", async () => {
    const harness = createFlow({
      scan: async () => {
        throw new Error("Could not reach the DevConnect API.");
      },
    });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "media" });
    expect(harness.flow.snapshot().libraryError).toBe("Could not reach the DevConnect API.");
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m-new"]);
    expect(harness.flow.snapshot().threadPane).toBe("media");
  });

  test("a stale scan does not publish another conversation", async () => {
    let release: (value: { messages: ReturnType<typeof textMessage>[]; complete: boolean }) => void = () => undefined;
    const harness = createFlow({
      scan: () => new Promise((resolve) => {
        release = resolve;
      }),
    });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    const pending = harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "search" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c2" });
    await settle();
    release({ messages: [textMessage("secret", "c1", "do not show", "2026-10-12T00:00:00.000Z")], complete: true });
    await pending;
    expect(harness.flow.snapshot().activeConversationId).toBe("c2");
    expect(harness.flow.snapshot().library.map((item) => item.text)).not.toContain("do not show");
    expect(harness.flow.snapshot().threadPane).toBe("chat");
  });

  test("opening a result pages older history and highlights that message once", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "revealMessage", messageId: "m-paged" });
    const messages = harness.flow.snapshot().messages;
    expect(messages.filter((item) => item.id === "m-paged")).toHaveLength(1);
    expect(messages.filter((item) => item.id === "m-new")).toHaveLength(1);
    expect(harness.flow.snapshot().highlightMessageId).toBe("m-paged");
    expect(harness.flow.snapshot().threadPane).toBe("chat");
  });

  test("a live attachment is added once and a document saves through the host", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "openLibrary", pane: "media" });
    const frame = {
      type: "MESSAGE" as const,
      data: {
        id: "m-live",
        conversationId: "c1",
        senderId: "u2",
        recipientId: "u1",
        ciphertext: "e30=",
        messageType: "TEXT" as const,
        status: "SENT" as const,
        createdAt: "2026-10-12T03:00:00.000Z",
      },
    };
    harness.flow.ingestFrame(frame);
    harness.flow.ingestFrame(frame);
    expect(harness.flow.snapshot().library.filter((item) => item.id === "m-live")).toHaveLength(1);
    await harness.flow.handleMessage({ version: 1, type: "saveLibraryFile", messageId: "m-file", attachmentId: "doc-1" });
    expect(harness.saved[0]?.name).toBe("notes.pdf");
    expect(Array.from(harness.saved[0]?.bytes ?? [])).toEqual([1, 2, 3]);

    await harness.flow.handleMessage({ version: 1, type: "logout" });
    expect(harness.flow.snapshot().library).toEqual([]);
    expect(harness.flow.snapshot().threadPane).toBe("chat");
    expect(harness.flow.snapshot().activeConversationId).toBeNull();
  });
});
