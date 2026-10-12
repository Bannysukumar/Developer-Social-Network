import { describe, expect, test } from "bun:test";
import type { AuthService } from "../src/extension/auth-service";
import { SessionFlow } from "../src/extension/session-flow";
import { emptyHostState, renderWebview } from "../src/extension/webview";

const me = { id: "u1", username: "ada", displayName: "Ada", accountType: "PUBLIC" as const, relationship: "SELF" as const };
const conversation = { id: "c1", type: "ONE_TO_ONE" as const, participantIds: ["u1", "u2"], peerDisplayName: "Grace", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };

const card = {
  id: "s1",
  ownerId: "u2",
  mediaType: "IMAGE" as const,
  contentType: "image/jpeg",
  caption: "shipped",
  textStyle: "plain" as const,
  createdAt: "2026-10-12T10:00:00.000Z",
  expiresAt: "2026-10-13T10:00:00.000Z",
  viewed: false,
  mine: false,
  myReaction: null,
};

function storyCard(id: string, ownerId: string, mine: boolean) {
  return {
    id,
    ownerId,
    mediaType: "IMAGE" as const,
    contentType: "image/jpeg",
    caption: id,
    textStyle: "plain" as const,
    createdAt: "2026-10-12T10:00:00.000Z",
    expiresAt: "2026-10-13T10:00:00.000Z",
    viewed: false,
    mine,
    myReaction: null,
  };
}

function createFlow(overrides: Record<string, unknown> = {}) {
  const sent: string[] = [];
  let views = 0;
  let live = true;
  const auth = {
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
    lastRoute: () => ({ screen: "home" as const }),
    rememberRoute: () => undefined,
    markConversationRead: async () => undefined,
    blockStatus: async () => ({ blockedByMe: false, blockedMe: false }),
    userFacingError: (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.",
    logout: async () => undefined,
    loadStories: async () => live
      ? { mine: [], rings: [{ user: { id: "u2", username: "grace", displayName: "Grace" }, unseen: true, stories: [card] }] }
      : { mine: [], rings: [] },
    publishStory: async () => {
      throw new Error("Could not reach the DevConnect API.");
    },
    viewStory: async () => {
      views += 1;
      return { ...card, viewed: true };
    },
    storyMedia: async () => new Uint8Array([1, 2, 3]),
    openConversation: async () => ({ conversation, messages: [], nextCursor: null, hasNext: false }),
    sendMessage: async (_id: string, text: string) => {
      sent.push(text);
      return { id: "m1", conversationId: "c1", senderId: "u1", displayText: text };
    },
    deleteStory: async () => undefined,
    storyViewers: async () => [],
    reactToStory: async () => ({ ...card, myReaction: "🔥" }),
    clearStoryReaction: async () => card,
    ...overrides,
  };
  return {
    sent,
    views: () => views,
    removeLive() { live = false; },
    flow: new SessionFlow(auth as unknown as AuthService, () => undefined),
  };
}

describe("stories", () => {
  test("the home page renders a story row without sample users", () => {
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, emptyHostState());
    expect(html).toContain('id="story-row"');
    expect(html).toContain("Your story");
    expect(html).toContain("Add to your story");
    expect(html).toContain('id="story-pause"');
    expect(html).toContain("multiple");
    const main = html.split("</main>")[0] ?? "";
    const outside = html.split("</main>")[1] ?? "";
    expect(main).not.toContain('id="story-composer"');
    expect(outside).toContain('id="story-composer"');
    expect(outside).toContain('id="story-viewer"');
    expect(html).toContain('data-act="add-story"');
    expect(html).toContain('data-act="open-story"');
    expect(html).toContain('" of "');
    expect(html).toContain("Share a moment with your connections.");
    expect(html).toContain(".story-ring.unseen");
    expect(html).toContain(".story-ring.seen");
    expect(html).toContain("media-src data: blob:");
    expect(html).not.toContain("sample user");
    expect(html).not.toMatch(/https?:\/\//i);
  });

  test("a failed publish does not add a story, a view is recorded once, and a reply uses encrypted chat", async () => {
    const harness = createFlow();
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "refreshStories" });
    expect(harness.flow.snapshot().storyTray.rings[0]?.user.displayName).toBe("Grace");
    expect(harness.flow.snapshot().storyTray.rings[0]?.unseen).toBe(true);

    await harness.flow.handleMessage({
      version: 1,
      type: "publishStory",
      clientStoryId: "client-01",
      caption: "draft",
      textStyle: "plain",
      contentType: "image/jpeg",
      dataBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    });
    expect(harness.flow.snapshot().storyTray.mine).toEqual([]);
    expect(harness.flow.snapshot().error).toBe("Could not reach the DevConnect API.");

    await harness.flow.handleMessage({ version: 1, type: "viewStory", storyId: "s1" });
    await harness.flow.handleMessage({ version: 1, type: "viewStory", storyId: "s1" });
    expect(harness.views()).toBe(1);
    expect(harness.flow.snapshot().storyTray.rings[0]?.stories[0]?.viewed).toBe(true);
    expect(harness.flow.snapshot().storyStage?.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);

    await harness.flow.handleMessage({ version: 1, type: "replyToStory", ownerId: "u2", storyId: "s1", text: "nice" });
    expect(harness.sent[0]).toContain("Reply to a story: shipped");
    expect(harness.sent[0]).toContain("nice");

    harness.removeLive();
    harness.flow.ingestFrame({ type: "STORY_DELETED", data: { storyId: "s1", ownerId: "u2" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.flow.snapshot().storyTray.rings).toEqual([]);
    expect(harness.flow.snapshot().storyViewer).toBeNull();

    await harness.flow.handleMessage({ version: 1, type: "logout" });
    expect(harness.flow.snapshot().storyTray).toEqual({ mine: [], rings: [] });
    expect(harness.flow.snapshot().storyStage).toBeNull();
  });

  test("two published stories stay independent, a delete removes only one, and a missing story is reported", async () => {
    let published = 0;
    const harness = createFlow({
      publishStory: async () => {
        published += 1;
        return storyCard(`mine-${published}`, "u1", true);
      },
    });
    await harness.flow.bootstrap();
    const payload = {
      caption: "hello",
      textStyle: "plain" as const,
      contentType: "image/jpeg",
      dataBase64: Buffer.from([0xff, 0xd8]).toString("base64"),
      openViewer: false,
    };
    await harness.flow.handleMessage({ version: 1, type: "publishStory", clientStoryId: "client-01", ...payload });
    await harness.flow.handleMessage({ version: 1, type: "publishStory", clientStoryId: "client-02", ...payload });
    const mine = harness.flow.snapshot().storyTray.mine;
    expect(mine.map((story) => story.id)).toEqual(["mine-1", "mine-2"]);
    expect(harness.flow.snapshot().storyViewer).toBeNull();
    expect(harness.flow.snapshot().notice).toBe("Your story has been shared.");

    await harness.flow.handleMessage({ version: 1, type: "deleteStory", storyId: "mine-1" });
    expect(harness.flow.snapshot().storyTray.mine.map((story) => story.id)).toEqual(["mine-2"]);

    await harness.flow.handleMessage({ version: 1, type: "viewStory", storyId: "missing" });
    expect(harness.flow.snapshot().storiesError).toBe("This story has expired or is no longer available.");
    expect(harness.flow.snapshot().storyViewer).toBeNull();
  });

  test("viewing one story does not mark another story viewed", async () => {
    const second = { ...card, id: "s2", caption: "later", viewed: false };
    const harness = createFlow({
      loadStories: async () => ({
        mine: [],
        rings: [{ user: { id: "u2", username: "grace", displayName: "Grace" }, unseen: true, stories: [card, second] }],
      }),
      viewStory: async (storyId: string) => ({ ...(storyId === "s2" ? second : card), viewed: true }),
    });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "refreshStories" });
    await harness.flow.handleMessage({ version: 1, type: "viewStory", storyId: "s1" });
    const stories = harness.flow.snapshot().storyTray.rings[0]?.stories ?? [];
    expect(stories.find((story) => story.id === "s1")?.viewed).toBe(true);
    expect(stories.find((story) => story.id === "s2")?.viewed).toBe(false);
  });

  test("an expired story is removed and reported instead of opening a blank viewer", async () => {
    const harness = createFlow({
      loadStories: async () => ({
        mine: [{ ...storyCard("old", "u1", true), expiresAt: "2020-01-01T00:00:00.000Z" }],
        rings: [],
      }),
    });
    await harness.flow.bootstrap();
    await harness.flow.handleMessage({ version: 1, type: "refreshStories" });
    await harness.flow.handleMessage({ version: 1, type: "viewStory", storyId: "old" });
    expect(harness.flow.snapshot().storyTray.mine).toEqual([]);
    expect(harness.flow.snapshot().storiesError).toBe("This story has expired or is no longer available.");
    expect(harness.flow.snapshot().storyViewer).toBeNull();
  });
});
