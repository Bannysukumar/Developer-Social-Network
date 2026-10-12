import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/api/errors";
import type { AuthService } from "../src/extension/auth-service";
import { chatBlockMenuAction, chatMenuMarkup } from "../src/extension/chat-menu";
import { SessionFlow } from "../src/extension/session-flow";
import { emptyHostState, renderWebview } from "../src/extension/webview";

const me = { id: "u1", username: "ada", displayName: "Ada", accountType: "PUBLIC" as const, relationship: "SELF" as const };
const conversation = { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"], peerDisplayName: "Grace", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z" };

function menuHtml(blockedByMe: boolean): string {
  const html = renderWebview({ cspSource: "vscode-webview://local" } as never, {
    ...emptyHostState(),
    screen: "messages",
    authenticated: true,
    user: me,
    conversations: [conversation],
    activeConversationId: "c1",
    blockedUsers: blockedByMe ? [{ id: "u2", username: "grace", displayName: "Grace", accountType: "PUBLIC", relationship: "BLOCKED" }] : [],
    messageLock: blockedByMe ? "blocked-by-me" : "none",
  });
  return html.split('id="thread-menu-pop"')[1]?.split("</div>")[0] ?? "";
}

function createFlow(fail = false) {
  let blocked = false;
  let releaseBlock: (() => void) | undefined;
  const held = { current: null as Promise<void> | null };
  const auth = {
    apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
    isAuthenticated: () => true,
    hasDeviceKeys: () => true,
    getUser: () => me,
    refreshProfile: async () => undefined,
    loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
    listConversations: async () => [{ ...conversation }],
    loadNotifications: async () => ({ items: [], unreadCount: 0 }),
    blockedUsers: async () => blocked ? [{ id: "u2", username: "grace", displayName: "Grace", accountType: "PUBLIC" as const, relationship: "BLOCKED" as const }] : [],
    ensureDeviceKeys: async () => undefined,
    lastRoute: () => undefined,
    rememberRoute: () => undefined,
    markConversationRead: async () => undefined,
    markNotificationRead: async () => undefined,
    blockStatus: async () => ({ blockedByMe: blocked, blockedMe: false }),
    openConversation: async () => ({
      conversation,
      messages: [{
        id: "m1",
        conversationId: "c1",
        senderId: "u2",
        recipientId: "u1",
        ciphertext: "e30=",
        messageType: "TEXT" as const,
        status: "READ" as const,
        createdAt: "2026-10-11T00:00:00.000Z",
        displayText: "hello",
      }],
      nextCursor: null,
      hasNext: false,
    }),
    displayMessage: (item: { id: string }) => ({ ...item, displayText: "hello" }),
    userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    blockUser: async () => {
      if (fail) throw new ApiError("network", "Could not reach the DevConnect API.");
      if (held.current) await held.current;
      blocked = true;
    },
    unblockUser: async () => {
      if (fail) throw new ApiError("network", "Could not reach the DevConnect API.");
      blocked = false;
    },
    clearConversation: async () => "2026-10-12T00:00:00.000Z",
  };
  return {
    flow: new SessionFlow(auth as unknown as AuthService, () => undefined),
    holdBlock() {
      held.current = new Promise((resolve) => {
        releaseBlock = resolve;
      });
    },
    releaseBlock() {
      releaseBlock?.();
      held.current = null;
    },
  };
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("chat block menu", () => {
  test("the menu shows Block user or Unblock user, never both, and never for yourself", () => {
    expect(chatBlockMenuAction({ selfId: "u1", peerId: "u2", blockedByMe: false })).toBe("block");
    expect(chatBlockMenuAction({ selfId: "u1", peerId: "u2", blockedByMe: true })).toBe("unblock");
    expect(chatBlockMenuAction({ selfId: "u1", peerId: "u1", blockedByMe: false })).toBeNull();
    expect(chatMenuMarkup("block")).toContain("Block user");
    expect(chatMenuMarkup("block")).not.toContain("Unblock user");
    expect(chatMenuMarkup("unblock")).toContain("Unblock user");
    expect(chatMenuMarkup("unblock")).not.toContain("Block user");
    expect(chatMenuMarkup("block")).toContain("Clear chat");
    expect(chatMenuMarkup("unblock")).toContain("Clear chat");

    const unblocked = menuHtml(false);
    const blocked = menuHtml(true);
    expect(unblocked).toContain('data-act="menu-block"');
    expect(unblocked).toContain("Block user");
    expect(unblocked).not.toContain("Unblock user");
    expect(unblocked).toContain("Clear chat");
    expect(blocked).toContain('data-act="menu-unblock"');
    expect(blocked).toContain("Unblock user");
    expect(blocked).not.toContain("Block user");
  });

  test("confirmation copy is in the chat menu and cancel does not send the request", () => {
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, emptyHostState());
    expect(html).toContain("Block this user?");
    expect(html).toContain("They will no longer be able to message you or send you a friend request.");
    expect(html).toContain("Unblock this user?");
    expect(html).toContain("Unblocking does not send a new friend request.");
    expect(html).toContain('id="dialog-cancel"');
    const blockAt = html.indexOf("Block this user?");
    const postAt = html.indexOf('type: "blockUser"', blockAt);
    expect(blockAt).toBeGreaterThan(-1);
    expect(postAt).toBeGreaterThan(blockAt);
    expect(html).not.toContain("window.alert");
  });

  test("a successful block waits for the server and keeps the chat history", async () => {
    const harness = createFlow();
    harness.holdBlock();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    const pending = harness.flow.handleMessage({ version: 1, type: "blockUser", userId: "u2" });
    await settle();
    expect(harness.flow.snapshot().messageLock).toBe("none");
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m1"]);
    harness.releaseBlock();
    await pending;
    expect(harness.flow.snapshot().messageLock).toBe("blocked-by-me");
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m1"]);
    expect(harness.flow.snapshot().conversations.map((item) => item.id)).toEqual(["c1"]);
    expect(harness.flow.snapshot().notice).toBe("User blocked.");
  });

  test("a failed block or unblock does not change the confirmed state", async () => {
    const harness = createFlow(true);
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await settle();
    await harness.flow.handleMessage({ version: 1, type: "blockUser", userId: "u2" });
    expect(harness.flow.snapshot().messageLock).toBe("none");
    expect(harness.flow.snapshot().messages.map((item) => item.id)).toEqual(["m1"]);
    expect(harness.flow.snapshot().error).toBe("Could not reach the DevConnect API.");
  });
});
