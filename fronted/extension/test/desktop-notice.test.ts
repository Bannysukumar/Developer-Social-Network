import { describe, expect, test } from "bun:test";
import { decideMessageNotice, decideNotificationNotice } from "../src/extension/desktop-notice";

const prefs = { messages: true, friendRequests: true, friendAccepted: true };

describe("desktop notices", () => {
  test("skips a message the user is already reading and a duplicate id", () => {
    const seen = new Set<string>();
    expect(decideMessageNotice("m1", "c1", false, true, prefs, seen)).toBeNull();
    const first = decideMessageNotice("m1", "c1", false, false, prefs, seen, "shaikn");
    expect(first?.action).toBe("Open message");
    expect(first?.body).toBe("shaikn sent you a message");
    expect(first?.conversationId).toBe("c1");
    seen.add("m1");
    expect(decideMessageNotice("m1", "c1", false, false, prefs, seen)).toBeNull();
    expect(decideMessageNotice("m2", "c1", true, false, prefs, seen)).toBeNull();
  });

  test("routes friend requests and does not double-notify a new message", () => {
    const seen = new Set<string>();
    const request = decideNotificationNotice({
      id: "n1",
      type: "FRIEND_REQUEST",
      message: "Rahul sent you a friend request",
      read: false,
    }, prefs, seen);
    expect(request?.screen).toBe("friends");
    expect(request?.action).toBe("View request");
    expect(decideNotificationNotice({
      id: "n2",
      type: "NEW_MESSAGE",
      message: "You received a new encrypted message",
      read: false,
    }, prefs, seen)).toBeNull();
    expect(decideNotificationNotice({
      id: "n1",
      type: "FRIEND_REQUEST",
      message: "Rahul sent you a friend request",
      read: false,
    }, { ...prefs, friendRequests: false }, seen)).toBeNull();
    const accepted = decideNotificationNotice({
      id: "n3",
      type: "FRIEND_REQUEST_ACCEPTED",
      actorId: "user-2",
      message: "Rahul accepted your friend request",
      read: false,
    }, prefs, seen);
    expect(accepted?.action).toBe("View profile");
    expect(accepted?.screen).toBe("user");
    expect(accepted?.userId).toBe("user-2");
    expect(decideNotificationNotice({
      id: "n4",
      type: "FRIEND_REQUEST_ACCEPTED",
      actorId: "user-2",
      message: "Rahul accepted your friend request",
      read: false,
    }, { ...prefs, friendAccepted: false }, seen)).toBeNull();
    expect(request?.friendsPanel).toBe("requests");
  });
});