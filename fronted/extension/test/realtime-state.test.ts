import { describe, expect, test } from "bun:test";
import { notificationFromFrame, parseServerFrame } from "../src/extension/chat-socket";
import { mergeLiveMessage, mergeNotification, retryDelayMs } from "../src/extension/realtime-state";

const message = {
  id: "m1",
  conversationId: "c1",
  senderId: "bob",
  recipientId: "ada",
  ciphertext: "e30=",
  messageType: "TEXT" as const,
  status: "SENT" as const,
};

describe("realtime state", () => {
  test("backs off and then stays at 30 seconds", () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(4)).toBe(16000);
    expect(retryDelayMs(5)).toBe(30000);
    expect(retryDelayMs(8)).toBe(30000);
  });

  test("appends a message in the open conversation and ignores a duplicate id", () => {
    const first = mergeLiveMessage([], message, "c1", "ada", 0);
    expect(first.messages?.[0]?.id).toBe("m1");
    expect(first.refresh).toBeNull();
    const again = mergeLiveMessage(first.messages ?? [], message, "c1", "ada", 0);
    expect(again.messages).toBeUndefined();
  });

  test("counts a message that arrived in another conversation", () => {
    const patch = mergeLiveMessage([], message, null, "ada", 0);
    expect(patch.bumpConversation).toBe("c1");
    expect(patch.toast).toBe("New message");
    expect(patch.refresh).toBe("conversations");
  });

  test("adds a friend-request notification once", () => {
    const note = {
      id: "n1",
      type: "FRIEND_REQUEST" as const,
      message: "Rahul sent you a friend request",
      read: false,
    };
    const frame = parseServerFrame(JSON.stringify({ type: "NOTIFICATION", data: note }));
    expect(notificationFromFrame(frame!)).toMatchObject({ id: "n1" });
    const first = mergeNotification([], note, 0, 0);
    expect(first.unreadNotifications).toBe(1);
    expect(first.refresh).toBe("social");
    expect(mergeNotification(first.notifications ?? [], note, 1, 1).refresh).toBeNull();
  });
});