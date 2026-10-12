import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "bun:test";
import type * as vscode from "vscode";
import { createApiConfig } from "../src/api/config";
import { ApiError } from "../src/api/errors";
import { AuthService } from "../src/extension/auth-service";
import { FileChatCache } from "../src/extension/chat-cache";
import { FileOutbox, createClientMessageId, isPermanentDeliveryError, nextAttemptDelay } from "../src/extension/outbox";
import { SessionFlow } from "../src/extension/session-flow";
import { emptyHostState, renderWebview } from "../src/extension/webview";

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

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, message: "ok", data }), { status });
}

describe("offline outbox and session", () => {
  test("a failed send stays visible and the same id is delivered once connectivity returns", async () => {
    const root = mkdtempSync(join(tmpdir(), "devconnect-outbox-"));
    const outbox = new FileOutbox(join(root, "outbox"));
    const cache = new FileChatCache(join(root, "cache"));
    let online = false;
    const delivered: string[] = [];
    const auth = {
      isAuthenticated: () => true,
      getUser: () => ({ id: "ada", username: "ada", displayName: "Ada" }),
      apiConfig: { baseUrl: "https://example.test/api/v1", allowInsecureHttp: false, timeoutMs: 15000 },
      hasDeviceKeys: () => true,
      refreshProfile: async () => { throw new ApiError("network", "Could not reach the DevConnect API."); },
      lastRoute: () => ({ screen: "messages", conversationId: "c1" }),
      rememberRoute: () => undefined,
      userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
      preparePlaintext: async (_conversationId: string, _text: string, clientMessageId: string) => {
        if (!online) throw new ApiError("network", "Could not reach the DevConnect API.");
        return { ciphertext: "cipher", messageType: "TEXT" as const, clientMessageId, deviceId: "dev", keyId: "1" };
      },
      deliverPrepared: async (_conversationId: string, prepared: { clientMessageId: string }) => {
        delivered.push(prepared.clientMessageId);
        if (delivered.length === 1) throw new ApiError("timeout", "The DevConnect API request timed out.");
        return {
          id: "server-1",
          conversationId: "c1",
          senderId: "ada",
          recipientId: "bob",
          ciphertext: "cipher",
          messageType: "TEXT" as const,
          status: "SENT" as const,
          displayText: "hello",
        };
      },
    };
    const flow = new SessionFlow(auth as unknown as AuthService, () => undefined, async () => undefined, () => undefined, outbox, cache);
    await flow.bootstrap();
    expect(flow.snapshot().authenticated).toBe(true);
    expect(flow.snapshot().screen).not.toBe("login");
    await flow.handleMessage({ version: 1, type: "sendMessage", conversationId: "c1", text: "hello" });
    expect(flow.snapshot().messages[0]?.displayText).toBe("hello");
    expect(flow.snapshot().messages[0]?.sendState).toBe("pending");
    const clientMessageId = flow.snapshot().messages[0]?.id.slice("local-".length) ?? "";
    const restarted = new SessionFlow(auth as unknown as AuthService, () => undefined, async () => undefined, () => undefined, outbox, cache);
    await restarted.bootstrap();
    expect(restarted.snapshot().messages.some((item) => item.displayText === "hello" && item.sendState === "pending")).toBe(true);
    online = true;
    restarted.setConnection("connected", true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(delivered).toEqual([clientMessageId]);
    expect(restarted.snapshot().messages[0]?.sendState).toBe("pending");
    await restarted.handleMessage({ version: 1, type: "retryOutbox", clientMessageId });
    expect(delivered).toEqual([clientMessageId, clientMessageId]);
    expect(restarted.snapshot().messages.some((item) => item.id === "server-1" && item.status === "SENT")).toBe(true);
    expect(outbox.list("ada")).toEqual([]);
    restarted.setConnection("connected", true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(delivered).toHaveLength(2);
    rmSync(root, { recursive: true, force: true });
  });

  test("a permanent rejection stays failed and is not retried", async () => {
    const outbox = new FileOutbox(mkdtempSync(join(tmpdir(), "devconnect-permanent-")));
    const auth = {
      isAuthenticated: () => true,
      getUser: () => ({ id: "ada" }),
      apiConfig: { baseUrl: "https://example.test/api/v1", allowInsecureHttp: false, timeoutMs: 15000 },
      hasDeviceKeys: () => true,
      refreshProfile: async () => { throw new ApiError("network", "Could not reach the DevConnect API."); },
      lastRoute: () => ({ screen: "messages", conversationId: "c1" }),
      rememberRoute: () => undefined,
      userFacingError: () => "You can't message this user.",
      preparePlaintext: async () => { throw new ApiError("http", "You can't message this user.", 403); },
      deliverPrepared: async () => { throw new Error("should not deliver"); },
    };
    const flow = new SessionFlow(auth as unknown as AuthService, () => undefined, async () => undefined, () => undefined, outbox);
    await flow.bootstrap();
    await flow.handleMessage({ version: 1, type: "sendMessage", conversationId: "c1", text: "nope" });
    expect(flow.snapshot().messages[0]?.sendState).toBe("failed");
    flow.setConnection("connected", true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(outbox.list("ada")[0]?.permanent).toBe(true);
    expect(outbox.list("ada")[0]?.attempts).toBe(1);
  });

  test("queued messages stay with the account that created them", () => {
    const root = mkdtempSync(join(tmpdir(), "devconnect-accounts-"));
    const outbox = new FileOutbox(root);
    outbox.save({
      accountId: "ada",
      conversationId: "c1",
      clientMessageId: "ext-account-a",
      kind: "text",
      createdAt: "2026-01-01T00:00:00.000Z",
      attempts: 0,
      nextAttemptAt: 0,
      permanent: false,
      displayText: "from ada",
      plaintext: "from ada",
    });
    expect(outbox.list("bob")).toEqual([]);
    expect(outbox.list("ada")[0]?.displayText).toBe("from ada");
    rmSync(root, { recursive: true, force: true });
  });

  test("a corrupt outbox file does not crash and a cache survives a new launch", () => {
    const root = mkdtempSync(join(tmpdir(), "devconnect-cache-"));
    const outbox = new FileOutbox(join(root, "outbox"));
    const accountDir = join(root, "outbox", "ada");
    mkdirSync(accountDir, { recursive: true });
    writeFileSync(join(accountDir, "queue.json"), "{", { flag: "w" });
    expect(outbox.list("ada")).toEqual([]);
    expect(existsSync(join(accountDir, "queue.json.corrupt"))).toBe(true);
    const cache = new FileChatCache(join(root, "cache"));
    cache.save("ada", {
      conversations: [{ id: "c1", participantIds: ["ada", "bob"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      threads: { c1: { messages: [{ id: "m1", conversationId: "c1", senderId: "bob", recipientId: "ada", messageType: "TEXT", status: "SENT", displayText: "saved" }], cursor: null, hasMore: false } },
    });
    expect(new FileChatCache(join(root, "cache")).load("ada")?.threads.c1?.messages[0]?.displayText).toBe("saved");
    expect(createClientMessageId(1_700_000_000_000, () => 0.1)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(nextAttemptDelay(0, () => 0)).toBe(1000);
    expect(nextAttemptDelay(6, () => 0)).toBe(30_000);
    expect(isPermanentDeliveryError(new ApiError("network", "offline"))).toBe(false);
    expect(isPermanentDeliveryError(new ApiError("http", "no", 403))).toBe(true);
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, emptyHostState());
    expect(html).toContain('aria-label="Waiting to send"');
    expect(html).toContain("Pending messages stay in this chat");
    rmSync(root, { recursive: true, force: true });
  });

  test("a network failure while refreshing keeps the stored session, and an invalid refresh does not", async () => {
    const context = memoryContext();
    let refreshCalls = 0;
    let refreshStatus = 0;
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/login")) {
        return envelope({
          tokenType: "Bearer",
          accessToken: "access-1",
          refreshToken: "refresh-1",
          accessTokenExpiresAt: "2000-01-01T00:00:00.000Z",
          refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z",
          user: { id: "ada", username: "ada", displayName: "Ada", accountType: "PUBLIC", email: "ada@example.com", relationship: "SELF" },
        });
      }
      if (path.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        if (refreshStatus === 0) throw new Error("offline");
        return new Response(JSON.stringify({ success: false, message: "expired" }), { status: refreshStatus });
      }
      return envelope(null);
    };
    const auth = new AuthService(context, createApiConfig({ baseUrl: "https://example.test/api/v1" }), { fetcher });
    await auth.login({ usernameOrEmail: "ada", password: "Sup3rSecret1" });
    const [first, second] = await Promise.all([auth.ensureFreshAccessToken(), auth.ensureFreshAccessToken()]);
    expect(first).toBe("access-1");
    expect(second).toBe("access-1");
    expect(refreshCalls).toBe(1);
    expect(auth.isAuthenticated()).toBe(true);
    refreshStatus = 401;
    await expect(auth.ensureFreshAccessToken()).resolves.toBeUndefined();
    expect(auth.isAuthenticated()).toBe(false);
  });
});
