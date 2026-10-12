import { describe, expect, test } from "bun:test";
import {
  documentEntries,
  fileBucket,
  highlightMatch,
  mediaEntries,
  searchEntries,
  sortByTime,
  toLibraryEntry,
  visibleLibrary,
  type LibraryEntry,
} from "../src/extension/conversation-library";

function entry(partial: Partial<LibraryEntry> & Pick<LibraryEntry, "id" | "text">): LibraryEntry {
  return {
    conversationId: "c1",
    senderId: "u2",
    createdAt: "2026-10-11T00:00:00.000Z",
    sealed: false,
    deleted: false,
    files: [],
    ...partial,
  };
}

describe("conversation library", () => {
  test("classifies media from MIME type and leaves documents in docs", () => {
    expect(fileBucket("image/gif")).toBe("gif");
    expect(fileBucket("image/png")).toBe("image");
    expect(fileBucket("video/mp4")).toBe("video");
    expect(fileBucket("application/pdf")).toBe("file");
    expect(fileBucket("")).toBe("file");
    expect(fileBucket("IMAGE/JPEG")).toBe("image");

    const photo = toLibraryEntry({
      id: "m1",
      conversationId: "c1",
      senderId: "u2",
      displayText: "look",
      attachments: [{ id: "a1", name: "shot.png", mime: "image/png", size: 12 }],
    });
    const gif = toLibraryEntry({
      id: "m2",
      conversationId: "c1",
      senderId: "u2",
      displayText: "",
      media: { kind: "gif", id: "wave" },
    });
    const pdf = toLibraryEntry({
      id: "m3",
      conversationId: "c1",
      senderId: "u1",
      displayText: "notes",
      attachments: [{ id: "a2", name: "notes.pdf", mime: "application/pdf", size: 40 }],
    });
    const items = [photo, gif, pdf];
    expect(mediaEntries(items).map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(documentEntries(items).map((item) => item.id)).toEqual(["m3"]);
    expect(photo.files[0]?.bucket).toBe("image");
    expect(pdf.files[0]?.bucket).toBe("file");
  });

  test("search is case-insensitive, partial, literal about special characters, and stays in one conversation", () => {
    const rows = [
      entry({ id: "m1", text: "Hello C++" }),
      entry({ id: "m2", text: "unrelated", conversationId: "c2" }),
      entry({ id: "m3", text: "sealed secret", sealed: true }),
      entry({ id: "m4", text: "", files: [{ id: "f", name: "Plan.pdf", mime: "application/pdf", size: 3, bucket: "file" }] }),
      entry({ id: "m5", text: "gone", deleted: true }),
    ];
    expect(searchEntries(visibleLibrary(rows, "c1"), "hello").map((item) => item.id)).toEqual(["m1"]);
    expect(searchEntries(visibleLibrary(rows, "c1"), "c++").map((item) => item.id)).toEqual(["m1"]);
    expect(searchEntries(visibleLibrary(rows, "c1"), ".*")).toEqual([]);
    expect(searchEntries(visibleLibrary(rows, "c1"), "plan").map((item) => item.id)).toEqual(["m4"]);
    expect(searchEntries(visibleLibrary(rows, "c1"), "secret")).toEqual([]);
    expect(searchEntries(visibleLibrary(rows, "c2"), "unrelated").map((item) => item.id)).toEqual(["m2"]);
    expect(highlightMatch("a <b> C++", "c++")).toBe("a &lt;b&gt; <mark>C++</mark>");
  });

  test("cleared history stays out of search and docs sort by time", () => {
    const rows = [
      entry({ id: "old", text: "before", createdAt: "2026-10-01T00:00:00.000Z" }),
      entry({ id: "new", text: "after", createdAt: "2026-10-12T00:00:00.000Z" }),
    ];
    const visible = visibleLibrary(rows, "c1", "2026-10-11T00:00:00.000Z");
    expect(searchEntries(visible, "before")).toEqual([]);
    expect(searchEntries(visible, "after").map((item) => item.id)).toEqual(["new"]);
    expect(sortByTime(rows, "oldest").map((item) => item.id)).toEqual(["old", "new"]);
    expect(sortByTime(rows, "newest").map((item) => item.id)).toEqual(["new", "old"]);
  });
});
