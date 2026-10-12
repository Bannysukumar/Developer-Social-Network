import { describe, expect, test } from "bun:test";
import { encodeMediaPayload, parseMediaPayload } from "../src/extension/crypto/media-payload";
import { ALLOWED_REACTIONS, searchEmoji, searchGifs, stickerById } from "../src/extension/media-catalog";
import { applyUserReaction, placePicker, summarizeReactions } from "../src/extension/reaction-state";
import { emptyHostState, renderWebview } from "../src/extension/webview";

describe("stickers, GIFs, and reactions", () => {
  test("a sticker id round-trips and an unknown catalog id still parses for a fallback", () => {
    const encoded = encodeMediaPayload("sticker", "wave");
    expect(parseMediaPayload(encoded)).toEqual({ kind: "sticker", id: "wave" });
    expect(stickerById("wave")?.name).toBe("Wave");
    expect(parseMediaPayload('{"devconnect":"media-v1","kind":"gif","id":"missing"}')).toEqual({ kind: "gif", id: "missing" });
    expect(parseMediaPayload("hello")).toBeUndefined();
  });

  test("GIF search stays local and an unknown query is empty", () => {
    expect(searchGifs("").map((item) => item.id)).toEqual(["spark", "bounce", "loop", "pass"]);
    expect(searchGifs("happy").map((item) => item.id)).toEqual(["bounce"]);
    expect(searchGifs("no-such-gif")).toEqual([]);
  });

  test("one user has one reaction, and two users do not inflate the count", () => {
    const first = applyUserReaction([], "ada", "👍");
    const changed = applyUserReaction(first, "ada", "❤️");
    const both = applyUserReaction(changed, "grace", "❤️");
    const cleared = applyUserReaction(both, "ada", null);
    expect(changed).toEqual([{ userId: "ada", emoji: "❤️" }]);
    expect(summarizeReactions(both, "ada")).toEqual([{ emoji: "❤️", count: 2, mine: true, userIds: ["ada", "grace"] }]);
    expect(summarizeReactions(cleared, "ada")).toEqual([{ emoji: "❤️", count: 1, mine: false, userIds: ["grace"] }]);
    expect(applyUserReaction(both, "ada", "❤️").filter((item) => item.userId === "ada")).toHaveLength(1);
  });

  test("the composer offers stickers and GIFs without a remote GIF service", () => {
    const html = renderWebview({ cspSource: "vscode-webview://local" } as never, emptyHostState());
    expect(html).toContain('aria-label="Stickers"');
    expect(html).toContain('aria-label="GIFs"');
    expect(html).toContain("GIF search stays on this device");
    expect(html).toContain("react-bar");
    expect(html).toContain('aria-label="Choose an emoji"');
    expect(html).toContain(".react-bar { display: none; position: absolute;");
    expect(html).toContain("max-height: 240px");
    expect(html).toContain(">React</button>");
    expect(html).not.toContain('aria-label="Add reaction"');
    expect(html).not.toContain("react-pop");
    expect(html).not.toContain("giphy");
    expect(html).not.toContain("tenor");
  });

  test("emoji search is local and the picker stays inside the view", () => {
    expect(searchEmoji("cat").map((item) => item.emoji)).toEqual(["🐱"]);
    expect(ALLOWED_REACTIONS.every((emoji) => emoji.length <= 8)).toBe(true);
    expect(searchEmoji("", "Food").some((item) => item.emoji === "☕")).toBe(true);
    expect(placePicker({ top: 20, bottom: 48, left: 400, right: 430 }, { width: 280, height: 240 }, { width: 420, height: 300 }))
      .toEqual({ top: 52, left: 132 });
    expect(placePicker({ top: 400, bottom: 430, left: 12, right: 40 }, { width: 280, height: 240 }, { width: 800, height: 500 }).top)
      .toBe(152);
  });
});
