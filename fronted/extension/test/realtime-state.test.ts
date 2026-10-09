import { describe, expect, test } from "bun:test";
import { notificationFromFrame, parseServerFrame } from "../src/extension/chat-socket";
import { applyNotificationRead, applyTombstone, mergeHistory, mergeLiveMessage, mergeNotification, mergeReceipt, retryDelayMs } from "../src/extension/realtime-state";

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

  test("replaces the sender's pending bubble instead of showing the message twice", () => {
    const pending = { ...message, id: "local-1", senderId: "ada", sendState: "sending" as const, displayText: "hi" };
    const delivered = { ...message, id: "server-1", senderId: "ada" };
    const first = mergeLiveMessage([pending], delivered, "c1", "ada", 0);
    expect(first.messages?.map((item) => item.id)).toEqual(["server-1"]);
    const again = mergeLiveMessage(first.messages ?? [], delivered, "c1", "ada", 0);
    expect(again.messages).toBeUndefined();
  });

  test("replaces a message with the deletion tombstone and ignores a repeat", () => {
    const first = mergeLiveMessage([], message, "c1", "ada", 0);
    const tombstone = { ...message, ciphertext: "", deletedForEveryone: true };
    const updated = mergeLiveMessage(first.messages ?? [], tombstone, "c1", "ada", 0);
    expect(updated.messages?.[0]?.deletedForEveryone).toBe(true);
    expect(updated.messages?.[0]?.ciphertext).toBe("");
    const again = mergeLiveMessage(updated.messages ?? [], tombstone, "c1", "ada", 0);
    expect(again.messages).toBeUndefined();
  });

  test("counts a message that arrived in another conversation", () => {
    const patch = mergeLiveMessage([], message, null, "ada", 0);
    expect(patch.bumpConversation).toBe("c1");
    expect(patch.toast).toBeNull();
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

  test("marks one notification read and decreases the shared unread count", () => {
    const notes = [
      { id: "n1", read: false, message: "Rahul sent you a message" },
      { id: "n2", read: false, message: "Rahul sent you a friend request" },
    ];
    const next = applyNotificationRead(notes, 2, { ...notes[0], read: true });
    expect(next.notifications.map((item) => item.read)).toEqual([true, false]);
    expect(next.unreadCount).toBe(1);
    expect(applyNotificationRead(next.notifications, next.unreadCount, { ...notes[0], read: true }).unreadCount).toBe(1);
  });

  test("applies a deletion immediately and ignores a late copy of the ciphertext", () => {
    const first = mergeLiveMessage([], message, "c1", "ada", 0);
    const hidden = applyTombstone(first.messages ?? [], "m1");
    expect(hidden?.[0]?.displayText).toBe("This message was deleted");
    const stale = mergeLiveMessage(hidden ?? [], message, "c1", "ada", 0);
    expect(stale.messages).toBeUndefined();
    expect(applyTombstone(hidden ?? [], "m1")).toBeUndefined();
  });

  test("a late delivered receipt cannot overwrite read", () => {
    const read = [{ ...message, status: "READ" as const }];
    expect(mergeReceipt(read, { type: "DELIVERED", data: { messageId: "m1" } })).toBeUndefined();
    expect(mergeReceipt([{ ...message, status: "DELIVERED" }], { type: "READ", data: { messageId: "m1" } })?.[0]?.status).toBe("READ");
  });

  test("a stale history response cannot restore deleted text or lower a read receipt", () => {
    const current = [{ ...message, status: "READ" as const, ciphertext: "", deletedForEveryone: true, displayText: "This message was deleted" }];
    const fetched = [{ ...message, status: "DELIVERED" as const, ciphertext: "still-there" }];
    const merged = mergeHistory(current, fetched);
    expect(merged[0]?.deletedForEveryone).toBe(true);
    expect(merged[0]?.ciphertext).toBe("");
    expect(merged[0]?.displayText).toBe("This message was deleted");
    const receipt = mergeHistory([{ ...message, status: "READ" }], [{ ...message, status: "SENT" }]);
    expect(receipt[0]?.status).toBe("READ");
  });

  test("accepts a hide-message frame", () => {
    expect(parseServerFrame('{"type":"MESSAGE_HIDDEN","data":{"messageId":"m1","conversationId":"c1"}}')?.type).toBe("MESSAGE_HIDDEN");
    expect(parseServerFrame('{"type":"MESSAGE_DELETED","data":{"messageId":"m1","conversationId":"c1","deletedAt":"2026-10-09T12:00:00Z"}}')?.type).toBe("MESSAGE_DELETED");
  });
});