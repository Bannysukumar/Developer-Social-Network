import { describe, expect, test } from "bun:test";
import type * as vscode from "vscode";
import { createApiConfig } from "../src/api/config";
import { ApiError } from "../src/api/errors";
import type { MessageDto } from "../src/shared/api-types";
import { AuthService } from "../src/extension/auth-service";
import { SessionFlow } from "../src/extension/session-flow";
import { createDeviceMaterial } from "../src/extension/crypto/device-keys";
import { openFile, sealFile } from "../src/extension/crypto/file-cipher";
import { encodeFilePayload } from "../src/extension/crypto/file-payload";
import { decryptMessage, encryptForDevices } from "../src/extension/crypto/message-cipher";

const me = {
  id: "u1",
  username: "ada",
  displayName: "Ada",
  accountType: "PUBLIC" as const,
  relationship: "SELF" as const,
};
const conversation = { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"] };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const zip = Buffer.from("PK\x03\x04notes");

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

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("inline image messages", () => {
  test("a native decryption error used to become the generic viewer failure", () => {
    const auth = new AuthService(memoryContext(), createApiConfig({ baseUrl: "https://api.example.test/api/v1" }));
    expect(auth.userFacingError(new Error("Unsupported state or unable to authenticate data"))).toBe("Something went wrong. Try again.");
    expect(auth.userFacingError(new Error("This file could not be opened."))).toBe("This file could not be opened.");
  });

  test("sender, recipient, reload, retry, and cleanup keep one decrypted image", async () => {
    const alice = createDeviceMaterial();
    const bob = createDeviceMaterial();
    alice.deviceId = "alice-device";
    bob.deviceId = "bob-device";
    const sealed = sealFile(png);
    const stored = new Map<string, Buffer>([["att-1", sealed.ciphertext]]);
    const payload = encodeFilePayload("look", [{
      id: "att-1",
      name: "photo.png",
      size: png.length,
      mime: "image/png",
      key: sealed.key,
      iv: sealed.iv,
    }]);
    const envelope = encryptForDevices(payload, "c1", alice, [{
      deviceId: bob.deviceId,
      identityPublicKey: bob.identityPublic,
      signedPreKey: {
        preKeyId: bob.signedPreKeyId,
        publicKey: bob.signedPreKeyPublic,
        signature: bob.signedPreKeySignature,
      },
    }]);
    expect(Buffer.from(envelope, "base64").toString("utf8")).not.toContain(sealed.key);
    expect(decryptMessage(envelope, bob)).toContain(sealed.key);

    const message: MessageDto = {
      id: "m1",
      conversationId: "c1",
      senderId: "u2",
      recipientId: "u1",
      ciphertext: envelope,
      messageType: "IMAGE",
      status: "SENT",
      attachmentIds: ["att-1"],
    };
    let downloads = 0;
    let missing = false;
    let unauthorized = false;
    let corrupt = false;
    let showHistory = true;
    const saved: Uint8Array[] = [];
    const displayed = {
      ...message,
      displayText: "look",
      attachments: [{
        id: "att-1",
        name: "photo.png",
        size: png.length,
        mime: "image/png",
        key: sealed.key,
        iv: sealed.iv,
      }],
    };
    const recipientAuth = {
      apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
      isAuthenticated: () => true,
      hasDeviceKeys: () => true,
      getUser: () => me,
      refreshProfile: async () => undefined,
      loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
      listConversations: async () => [conversation],
      loadNotifications: async () => ({ items: [], unreadCount: 0 }),
      blockedUsers: async () => [],
      ensureDeviceKeys: async () => undefined,
      lastRoute: () => undefined,
      rememberRoute: () => undefined,
      markConversationRead: async () => undefined,
      blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
      logout: async () => undefined,
      openConversation: async () => ({
        conversation,
        messages: showHistory ? [displayed] : [],
      }),
      displayMessage: (item: MessageDto) => {
        const text = decryptMessage(item.ciphertext ?? "", bob) ?? "";
        const body = JSON.parse(text) as { text: string; files: { id: string; name: string; size: number; mime: string; key: string; iv: string }[] };
        return { ...item, displayText: body.text, attachments: body.files };
      },
      downloadAttachment: async (id: string, key: string, iv: string) => {
        downloads += 1;
        if (unauthorized) throw new ApiError("api", "Authentication is required.", 401);
        if (missing) throw new ApiError("api", "The requested item was not found.", 404);
        const bytes = stored.get(id);
        if (!bytes) throw new ApiError("api", "The requested item was not found.", 404);
        const source = corrupt ? Buffer.from(bytes.map((value, index) => index === 0 ? value ^ 1 : value)) : bytes;
        return openFile(source, key, iv);
      },
      userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    };
    const recipient = new SessionFlow(recipientAuth as unknown as AuthService, () => undefined, async (_name, bytes) => { saved.push(bytes); });

    await recipient.bootstrap();
    await recipient.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await wait();
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.preview).toContain("data:image/png;base64,");
    expect(downloads).toBe(1);

    await recipient.handleMessage({ version: 1, type: "closeThread" });
    await recipient.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await wait();
    expect(downloads).toBe(1);
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.preview).toContain("data:image/png;base64,");

    const restarted = new SessionFlow(recipientAuth as unknown as AuthService, () => undefined);
    await restarted.bootstrap();
    await restarted.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    await wait();
    expect(downloads).toBe(2);
    expect(restarted.snapshot().messages[0]?.attachments?.[0]?.preview).toContain("data:image/png;base64,");

    showHistory = false;
    await recipient.handleMessage({ version: 1, type: "closeThread" });
    await recipient.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    recipient.ingestFrame({ type: "MESSAGE", data: { ...message, id: "m-live" } });
    recipient.ingestFrame({ type: "MESSAGE", data: { ...message, id: "m-live" } });
    await wait();
    expect(recipient.snapshot().messages.filter((item) => item.id === "m-live")).toHaveLength(1);
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.preview).toContain("data:image/png;base64,");

    await recipient.handleMessage({ version: 1, type: "saveAttachment", messageId: "m-live", attachmentId: "att-1" });
    expect(Buffer.from(saved[0] ?? []).equals(png)).toBe(true);

    corrupt = true;
    await recipient.handleMessage({ version: 1, type: "reloadImage", messageId: "m-live", attachmentId: "att-1" });
    await wait();
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.loadError).toBe(true);
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.loadDetail).toBe("Couldn't open this image.");
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.preview).toBeUndefined();
    expect(recipient.snapshot().error).toBeNull();
    const afterCorrupt = downloads;
    await wait();
    expect(downloads).toBe(afterCorrupt);

    corrupt = false;
    missing = true;
    await recipient.handleMessage({ version: 1, type: "reloadImage", messageId: "m-live", attachmentId: "att-1" });
    await wait();
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.loadError).toBe(true);
    missing = false;
    unauthorized = true;
    await recipient.handleMessage({ version: 1, type: "reloadImage", messageId: "m-live", attachmentId: "att-1" });
    await wait();
    expect(recipient.snapshot().messages[0]?.attachments?.[0]?.loadError).toBe(true);
    expect(recipient.snapshot().error).toBeNull();
  });

  test("the sender keeps a local preview through send, failure, and retry", async () => {
    let release: (() => void) | undefined;
    let hold = true;
    let fail = false;
    let sends = 0;
    const clientIds: string[] = [];
    const savedPreviews: string[] = [];
    const flow = new SessionFlow({
      apiConfig: { baseUrl: "https://api.example.test/api/v1", allowInsecureHttp: false },
      isAuthenticated: () => true,
      hasDeviceKeys: () => true,
      getUser: () => me,
      refreshProfile: async () => undefined,
      loadSocial: async () => ({ friends: [], incoming: [], outgoing: [] }),
      listConversations: async () => [conversation],
      loadNotifications: async () => ({ items: [], unreadCount: 0 }),
      blockedUsers: async () => [],
      ensureDeviceKeys: async () => undefined,
      lastRoute: () => undefined,
      rememberRoute: () => undefined,
      markConversationRead: async () => undefined,
      blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
      logout: async () => undefined,
      openConversation: async () => ({ conversation, messages: [] }),
      sendFiles: async (_conversationId: string, text: string, files: { name: string; mime: string; bytes: Buffer }[], clientMessageId: string) => {
        sends += 1;
        clientIds.push(clientMessageId);
        if (hold) await new Promise<void>((resolve) => { release = resolve; });
        if (fail) {
          fail = false;
          throw new Error("Could not reach the DevConnect API.");
        }
        const file = files[0];
        if (!file) throw new Error("missing");
        const preview = file.mime.startsWith("image/") ? `data:${file.mime};base64,${file.bytes.toString("base64")}` : undefined;
        if (preview) savedPreviews.push(preview);
        return {
          id: "m-sent",
          conversationId: "c1",
          senderId: "u1",
          recipientId: "u2",
          ciphertext: "sealed-envelope",
          messageType: file.mime.startsWith("image/") ? "IMAGE" as const : "FILE" as const,
          status: "SENT" as const,
          displayText: text || file.name,
          attachmentIds: ["att-sent"],
          attachments: [{
            id: "att-sent",
            name: file.name,
            size: file.bytes.length,
            mime: file.mime,
            key: "local-key",
            iv: "local-iv",
            preview,
          }],
        };
      },
      downloadAttachment: async () => { throw new Error("sender should reuse the local preview"); },
      userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    } as unknown as AuthService, () => undefined);

    await flow.bootstrap();
    await flow.handleMessage({ version: 1, type: "openConversation", conversationId: "c1" });
    const sending = flow.handleMessage({
      version: 1,
      type: "sendFiles",
      conversationId: "c1",
      text: "caption",
      files: [
        { name: "photo.png", mime: "image/png", base64: png.toString("base64") },
        { name: "notes.zip", mime: "application/zip", base64: zip.toString("base64") },
      ],
    });
    const pending = flow.snapshot().messages[0];
    expect(pending?.sendState).toBe("sending");
    expect(pending?.attachments?.[0]?.preview).toContain("data:image/png;base64,");
    expect(pending?.attachments?.[1]?.preview).toBeUndefined();
    expect(pending?.attachments?.[1]?.mime).toBe("application/zip");
    expect(pending?.attachments?.[0]?.id).not.toBe(pending?.attachments?.[1]?.id);
    release?.();
    hold = false;
    await sending;
    expect(flow.snapshot().messages).toHaveLength(1);
    expect(flow.snapshot().messages[0]?.id).toBe("m-sent");
    expect(flow.snapshot().messages[0]?.attachments?.[0]?.preview).toContain("data:image/png;base64,");
    expect(flow.snapshot().messages[0]?.displayText).toBe("caption");

    fail = true;
    await flow.handleMessage({
      version: 1,
      type: "sendFiles",
      conversationId: "c1",
      files: [{ name: "photo.png", mime: "image/png", base64: png.toString("base64") }],
    });
    const failed = flow.snapshot().messages.find((item) => item.sendState === "failed");
    expect(failed?.attachments?.[0]?.preview).toContain("data:image/png;base64,");
    const localId = failed?.id ?? "";
    await flow.handleMessage({ version: 1, type: "retryFiles", localId });
    expect(clientIds.at(-1)).toBe(clientIds.at(-2));
    expect(flow.snapshot().messages.filter((item) => item.id === "m-sent")).toHaveLength(1);
    expect(sends).toBe(3);

    await flow.handleMessage({ version: 1, type: "logout" });
    expect(flow.snapshot().messages).toHaveLength(0);
  });
});
