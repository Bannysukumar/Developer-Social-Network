import { describe, expect, test } from "bun:test";
import type * as vscode from "vscode";
import { createApiConfig } from "../src/api/config";
import { AuthService } from "../src/extension/auth-service";
import { SessionFlow } from "../src/extension/session-flow";
import { createDeviceMaterial } from "../src/extension/crypto/device-keys";

const me = {
  id: "u1",
  username: "ada",
  displayName: "Ada",
  accountType: "PUBLIC",
  email: "ada@example.com",
  relationship: "SELF",
};
const bob = {
  id: "u2",
  username: "bob",
  displayName: "Bob",
  accountType: "PUBLIC",
  relationship: "NONE",
};

function memoryContext(): vscode.ExtensionContext {
  const secrets = new Map<string, string>();
  const state = new Map<string, unknown>();
  return {
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => { secrets.set(key, value); },
      delete: async (key: string) => { secrets.delete(key); },
    },
    globalState: {
      get: (key: string) => state.get(key),
      update: async (key: string, value: unknown) => { state.set(key, value); },
    },
  } as vscode.ExtensionContext;
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, message: "ok", data }), { status });
}

const bobDevice = createDeviceMaterial();
bobDevice.deviceId = "bob-device";

function installFetch(): { fetcher: typeof fetch; friends: boolean } {
  const world = { friends: false, outgoing: false, requestId: "req-1" };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1/", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : {};
    if (path === "auth/signup" || path === "auth/login") {
      return ok({
        tokenType: "Bearer",
        accessToken: "access-1",
        refreshToken: "refresh-1",
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        refreshTokenExpiresAt: "2099-01-02T00:00:00Z",
        user: me,
      }, path === "auth/signup" ? 201 : 200);
    }
    if (path === "auth/logout" || path === "auth/forgot-password" || path === "auth/reset-password" || path === "auth/change-password") {
      return ok(null);
    }
    if (path === "users/me" && method === "GET") return ok(me);
    if (path === "users/me/blocks") return ok([]);
    if (path === "users/me" && method === "PATCH") return ok({ ...me, displayName: body.displayName, bio: body.bio, accountType: body.accountType });
    if (path === "users/search") return ok({ items: [{ ...bob, relationship: world.friends ? "FRIENDS" : "NONE" }], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false });
    if (path === "users/u2" && method === "GET") return ok({ ...bob, relationship: world.friends ? "FRIENDS" : world.outgoing ? "OUTGOING_REQUEST" : "NONE" });
    if (path === "users/u2/block" || path === "users/u2/block" ) return ok(null);
    if (path === "friend-requests/u2" && method === "POST") {
      world.outgoing = true;
      return ok({ id: world.requestId, senderId: "u1", recipientId: "u2", counterpart: bob, status: "PENDING" });
    }
    if (path === "friend-requests/incoming") {
      return ok({
        items: world.friends ? [] : [{ id: "in-1", senderId: "u2", recipientId: "u1", counterpart: bob, status: "PENDING" }],
        page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false,
      });
    }
    if (path === "friend-requests/outgoing") {
      return ok({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false });
    }
    if (path === "friend-requests/in-1/accept") {
      world.friends = true;
      return ok({ id: "in-1", senderId: "u2", recipientId: "u1", counterpart: { ...bob, relationship: "FRIENDS" }, status: "ACCEPTED" });
    }
    if (path === "friends") {
      return ok({
        items: world.friends ? [{ ...bob, relationship: "FRIENDS" }] : [],
        page: 0, size: 20, totalElements: world.friends ? 1 : 0, totalPages: 1, hasNext: false,
      });
    }
    if (path === "conversations" && method === "POST") {
      return ok({ id: "c1", type: "ONE_TO_ONE", participantIds: ["u1", "u2"] });
    }
    if (path === "conversations" && method === "GET") {
      return ok({ items: [{ id: "c1", type: "ONE_TO_ONE", participantIds: ["u1", "u2"] }], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false });
    }
    if (path === "conversations/c1") return ok({ id: "c1", type: "ONE_TO_ONE", participantIds: ["u1", "u2"] });
    if (path === "conversations/c1/messages" && method === "GET") {
      return ok({ items: [], nextCursor: null, hasNext: false });
    }
    if (path === "conversations/c1/messages" && method === "POST") {
      return ok({
        id: "m1", conversationId: "c1", senderId: "u1", recipientId: "u2",
        ciphertext: body.ciphertext, messageType: "TEXT", status: "SENT",
      });
    }
    if (path === "notifications") {
      return ok({
        page: {
          items: [{ id: "n1", type: "FRIEND_REQUEST", message: "Bob sent a request", read: false, referenceId: "in-1" }],
          page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false,
        },
        unreadCount: 1,
      });
    }
    if (path === "notifications/n1/read") {
      return ok({ id: "n1", type: "FRIEND_REQUEST", message: "Bob sent a request", read: true, referenceId: "in-1" });
    }
    if (path === "notifications/read-all") return ok(null);
    if (path === "devices") return ok([{ id: "d1", deviceName: "VS Code", platform: "EXTENSION", revoked: false }]);
    if (path === "devices/d1") return ok(null);
    if (path === "keys/identity" && method === "POST") {
      return ok({ id: "self-device", deviceName: "VS Code", platform: "EXTENSION", algorithm: "Ed25519" });
    }
    if (path === "keys/prekeys" && method === "POST") return ok(null);
    if (path === "keys/u2" && method === "GET") {
      return ok({
        userId: "u2",
        devices: [{
          deviceId: "bob-device",
          algorithm: "Ed25519",
          identityPublicKey: bobDevice.identityPublic,
          signedPreKey: {
            preKeyId: bobDevice.signedPreKeyId,
            publicKey: bobDevice.signedPreKeyPublic,
            signature: bobDevice.signedPreKeySignature,
          },
          oneTimePreKey: {
            preKeyId: bobDevice.oneTime[0]?.id,
            publicKey: bobDevice.oneTime[0]?.publicKey,
          },
        }],
      });
    }
    return new Response(JSON.stringify({ success: false, message: `unmapped ${method} ${path}` }), { status: 500 });
  };
  return { fetcher, friends: false };
}

function service(fetcher: typeof fetch, context = memoryContext()): AuthService {
  return new AuthService(context, createApiConfig({
    baseUrl: "https://api.example.test/api/v1",
    allowInsecureHttp: false,
  }), { fetcher });
}

describe("signed-in journey", () => {
  test("walks splash, signup, social, messages, settings, logout, and reopen", async () => {
    const { fetcher } = installFetch();
    const context = memoryContext();
    const flow = new SessionFlow(service(fetcher, context), () => undefined);

    await flow.bootstrap();
    expect(flow.snapshot().screen).toBe("login");
    expect(flow.snapshot().authenticated).toBe(false);

    await flow.handleMessage({ version: 1, type: "navigate", destination: "signup" });
    expect(flow.snapshot().screen).toBe("signup");
    await flow.handleMessage({
      version: 1, type: "signup", username: "ada", email: "ada@example.com", displayName: "Ada", password: "Sup3rSecret1",
    });
    expect(flow.snapshot().screen).toBe("home");
    expect(flow.snapshot().authenticated).toBe(true);

    await flow.handleMessage({ version: 1, type: "searchUsers", query: "bob" });
    expect(flow.snapshot().searchResults[0]?.username).toBe("bob");
    await flow.handleMessage({ version: 1, type: "openUser", userId: "u2" });
    expect(flow.snapshot().screen).toBe("user");
    await flow.handleMessage({ version: 1, type: "back" });
    expect(flow.snapshot().screen).toBe("home");
    await flow.handleMessage({ version: 1, type: "openUser", userId: "u2" });
    await flow.handleMessage({ version: 1, type: "sendFriendRequest", userId: "u2" });
    expect(flow.snapshot().notice).toBe("Friend request sent.");

    await flow.handleMessage({ version: 1, type: "navigate", destination: "friends" });
    expect(flow.snapshot().incomingRequests.length).toBe(1);
    await flow.handleMessage({ version: 1, type: "acceptFriendRequest", requestId: "in-1" });
    expect(flow.snapshot().friends[0]?.username).toBe("bob");

    await flow.handleMessage({ version: 1, type: "openConversation", participantId: "u2" });
    expect(flow.snapshot().screen).toBe("messages");
    expect(flow.snapshot().activeConversationId).toBe("c1");
    await flow.handleMessage({ version: 1, type: "sendMessage", conversationId: "c1", text: "hello" });
    expect(flow.snapshot().e2eeEnabled).toBe(true);
    expect(flow.snapshot().messages[0]?.displayText).toBe("hello");
    expect(flow.snapshot().messages[0]?.ciphertext).not.toContain("hello");

    await flow.handleMessage({ version: 1, type: "navigate", destination: "notifications" });
    expect(flow.snapshot().notifications[0]?.type).toBe("FRIEND_REQUEST");
    await flow.handleMessage({ version: 1, type: "openNotification", notificationId: "n1" });
    expect(flow.snapshot().screen).toBe("friends");

    await flow.handleMessage({ version: 1, type: "navigate", destination: "profile" });
    await flow.handleMessage({ version: 1, type: "updateProfile", displayName: "Ada Lovelace", bio: "code", accountType: "PRIVATE" });
    expect(flow.snapshot().notice).toBe("Account is now private.");

    await flow.handleMessage({ version: 1, type: "navigate", destination: "settings" });
    expect(flow.snapshot().devices[0]?.id).toBe("d1");
    await flow.handleMessage({ version: 1, type: "back" });
    expect(flow.snapshot().screen).toBe("home");

    await flow.handleMessage({ version: 1, type: "logout" });
    expect(flow.snapshot().screen).toBe("login");
    expect(flow.snapshot().authenticated).toBe(false);
    expect(flow.snapshot().friends).toEqual([]);
    expect(flow.snapshot().messages).toEqual([]);

    const reopenedLoggedOut = new SessionFlow(service(fetcher, context), () => undefined);
    await reopenedLoggedOut.bootstrap();
    expect(reopenedLoggedOut.snapshot().screen).toBe("login");

    await flow.handleMessage({ version: 1, type: "login", usernameOrEmail: "ada", password: "Sup3rSecret1" });
    expect(flow.snapshot().screen).toBe("home");
    const signedInContext = context;
    const reopened = new SessionFlow(service(fetcher, signedInContext), () => undefined);
    await reopened.bootstrap();
    expect(reopened.snapshot().phase).toBe("ready");
    expect(reopened.snapshot().screen).toBe("home");
    expect(reopened.snapshot().user?.username).toBe("ada");
  });
});
