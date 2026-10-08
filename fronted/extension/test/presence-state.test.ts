import { expect, test } from "bun:test";
import type { AuthService } from "../src/extension/auth-service";
import { chatActivity, mergePresence } from "../src/extension/presence-state";
import { SessionFlow } from "../src/extension/session-flow";

function auth(): AuthService {
  return {
    apiConfig: { allowInsecureHttp: false, baseUrl: "https://example.test/api/v1" },
    isAuthenticated: () => true,
    hasDeviceKeys: () => false,
    getUser: () => ({ id: "me" }),
  } as AuthService;
}

test("online replaces a stale last-seen snapshot", () => {
  const stale = mergePresence(undefined, { status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" }, "snapshot");
  const live = mergePresence(stale ?? undefined, { status: "ONLINE", userId: "friend" }, "socket");
  expect(live).toEqual({ status: "ONLINE", lastSeenAt: null });
  expect(chatActivity(live, false, true)).toBe("online");
});

test("a profile snapshot cannot override online", () => {
  const online = mergePresence(undefined, { status: "ONLINE" }, "socket");
  const kept = mergePresence(online ?? undefined, { status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" }, "snapshot");
  expect(kept?.status).toBe("ONLINE");
  expect(chatActivity(kept, false, true)).toBe("online");
});

test("offline shows last seen and not online", () => {
  const offline = mergePresence({ status: "ONLINE", lastSeenAt: null }, { status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" }, "socket");
  expect(offline).toEqual({ status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" });
  expect(chatActivity(offline, false, true)).toBe("last-seen");
});

test("online and typing stay together, and offline clears the typing label", () => {
  const online = { status: "ONLINE" as const, lastSeenAt: null };
  expect(chatActivity(online, true, true)).toBe("online-typing");
  expect(chatActivity(online, false, true)).toBe("online");
  expect(chatActivity({ status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" }, true, true)).toBe("last-seen");
});

test("hidden presence is not invented, including after a block", () => {
  expect(mergePresence({ status: "ONLINE", lastSeenAt: null }, null, "snapshot")).toBeNull();
  expect(chatActivity({ status: "ONLINE", lastSeenAt: null }, true, false)).toBe("hidden");
});

test("a presence event is stored by user id and offline clears typing", () => {
  const flow = new SessionFlow(auth(), () => {});
  flow.ingestFrame({ type: "TYPING_START", data: { conversationId: "c1", userId: "friend" } });
  flow.ingestFrame({ type: "PRESENCE_UPDATE", data: { userId: "friend", status: "ONLINE" } });
  expect(flow.snapshot().presenceByUser.friend?.status).toBe("ONLINE");
  expect(flow.snapshot().typing?.userId).toBe("friend");
  flow.ingestFrame({ type: "PRESENCE_UPDATE", data: { userId: "friend", status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" } });
  expect(flow.snapshot().presenceByUser.friend).toEqual({ status: "OFFLINE", lastSeenAt: "2026-10-08T16:00:00.000Z" });
  expect(flow.snapshot().typing).toBeNull();
  expect(flow.snapshot().presenceByUser.someone).toBeUndefined();
});
