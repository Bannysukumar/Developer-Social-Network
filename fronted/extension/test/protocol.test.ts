import { describe, expect, test } from "bun:test";
import { hostMessageSchema, webviewMessageSchema } from "../src/shared/protocol";

const host = {
  version: 1 as const,
  type: "state" as const,
  phase: "ready" as const,
  screen: "home" as const,
  canGoBack: false,
  authenticated: true,
  insecureHttp: true,
  e2eeEnabled: false as const,
  user: null,
  selectedUser: null,
  error: null,
  notice: null,
  busy: false,
  searchResults: [],
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  conversations: [],
  activeConversationId: null,
  messages: [],
  notifications: [],
  unreadNotifications: 0,
  unreadMessages: 0,
  connection: "offline" as const,
  toast: null,
  toastSeq: 0,
  devices: [],
  blockedUsers: [],
  avatars: {},
  messageLock: "none" as const,
  notifyMessages: true,
  notifyFriendRequests: true,
  notifyFriendAccepted: true,
  friendsPanel: "friends" as const,
  friendsPanelSeq: 0,
  unreadByConversation: {},
  conversationPreviews: {},
  presenceByUser: {},
  typing: null,
};

describe("Webview bridge protocol", () => {
  test("accepts splash-to-auth messages and rejects unknown screens", () => {
    expect(webviewMessageSchema.safeParse({ version: 1, type: "ready" }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({ version: 1, type: "navigate", destination: "forgot" }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({ version: 1, type: "back" }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({ version: 1, type: "navigate", destination: "settings-secret" }).success).toBe(false);
  });

  test("accepts password recovery messages", () => {
    expect(webviewMessageSchema.safeParse({
      version: 1, type: "forgotPassword", email: "ada@example.com",
    }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({
      version: 1, type: "resetPassword", token: "reset-token", newPassword: "Sup3rSecret!",
    }).success).toBe(true);
  });

  test("rejects extra properties", () => {
    expect(webviewMessageSchema.safeParse({ version: 1, type: "ready", command: "x" }).success).toBe(false);
  });

  test("requires the full host state and allows the encryption flag", () => {
    expect(hostMessageSchema.safeParse(host).success).toBe(true);
    expect(hostMessageSchema.safeParse({ ...host, e2eeEnabled: true }).success).toBe(true);
    expect(hostMessageSchema.safeParse({ version: 1, type: "state", screen: "home" }).success).toBe(false);
  });
});
