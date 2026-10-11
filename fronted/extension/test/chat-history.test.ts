import { describe, expect, test } from "bun:test";
import { dateSeparatorLabel, shouldLoadOlderHistory } from "../src/extension/date-label";
import { mergeHistory, mergeLiveMessage } from "../src/extension/realtime-state";

const now = new Date(2026, 9, 11, 15, 0, 0);

function at(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month, day, hour, 0, 0).toISOString();
}

function message(id: string, conversationId: string, createdAt: string, senderId = "bob") {
  return {
    id,
    conversationId,
    senderId,
    recipientId: "ada",
    ciphertext: "e30=",
    messageType: "TEXT" as const,
    status: "SENT" as const,
    createdAt,
    displayText: id,
  };
}

describe("chat history", () => {
  test("keeps both participants and drops the other conversation", () => {
    const current = [message("live", "c1", at(2026, 9, 11, 16), "ada")];
    const fetched = [
      message("old", "c1", at(2026, 9, 10), "bob"),
      message("mine", "c1", at(2026, 9, 11, 9), "ada"),
      message("other-chat", "c2", at(2026, 9, 11), "grace"),
    ];
    const merged = mergeHistory(current, fetched);
    expect(merged.map((item) => item.id)).toEqual(["live", "mine", "old"]);
    expect(merged.every((item) => item.conversationId === "c1")).toBe(true);
  });

  test("a live message that arrives during history loading is not duplicated or dropped", () => {
    const arrived = mergeLiveMessage([], message("m-live", "c1", at(2026, 9, 11, 16)), "c1", "ada", 0);
    const fetched = [message("m-live", "c1", at(2026, 9, 11, 16)), message("m-old", "c1", at(2026, 8, 1))];
    const merged = mergeHistory(arrived.messages ?? [], fetched);
    expect(merged.map((item) => item.id)).toEqual(["m-live", "m-old"]);
  });

  test("an older page is added without removing the messages already on screen", () => {
    const first = [message("new", "c1", at(2026, 9, 11))];
    const older = [message("older", "c1", at(2025, 11, 31))];
    const merged = mergeHistory(first, older);
    expect(merged.map((item) => item.id)).toEqual(["new", "older"]);
  });

  test("labels today, yesterday, this year, and a previous year from the local calendar", () => {
    expect(dateSeparatorLabel(at(2026, 9, 11, 1), now)).toBe("Today");
    expect(dateSeparatorLabel(at(2026, 9, 10, 23), now)).toBe("Yesterday");
    expect(dateSeparatorLabel(at(2026, 9, 5), now)).toBe("Monday, 5 October");
    expect(dateSeparatorLabel(at(2025, 9, 5), now)).toBe("Sunday, 5 October 2025");
  });

  test("a timestamp just after local midnight stays on today even when UTC is still yesterday", () => {
    const early = new Date(2026, 9, 11, 0, 30, 0);
    expect(dateSeparatorLabel(early.toISOString(), now)).toBe("Today");
    expect(early.toISOString().startsWith("2026-10-10") || early.toISOString().startsWith("2026-10-11")).toBe(true);
  });

  test("messages on the same local day share one label and a month boundary does not", () => {
    const labels = [
      dateSeparatorLabel(at(2026, 9, 1, 9), now),
      dateSeparatorLabel(at(2026, 9, 1, 18), now),
      dateSeparatorLabel(at(2026, 8, 30, 21), now),
    ];
    expect(labels[0]).toBe(labels[1]);
    expect(labels[0]).not.toBe(labels[2]);
    expect(labels[2]).toBe("Wednesday, 30 September");
  });

  test("equal timestamps stay in a stable newest-id order and are not duplicated", () => {
    const stamp = at(2026, 9, 11, 12);
    const merged = mergeHistory(
      [message("m-b", "c1", stamp)],
      [message("m-a", "c1", stamp), message("m-b", "c1", stamp), message("m-c", "c1", stamp)],
    );
    expect(merged.map((item) => item.id)).toEqual(["m-c", "m-b", "m-a"]);
  });

  test("older history is not requested until the list can scroll and the user is near the top", () => {
    const base = { hasMore: true, loading: false, scrollTop: 0, scrollHeight: 400, clientHeight: 400 };
    expect(shouldLoadOlderHistory(base)).toBe(false);
    expect(shouldLoadOlderHistory({ ...base, scrollHeight: 900, clientHeight: 400, scrollTop: 0 })).toBe(true);
    expect(shouldLoadOlderHistory({ ...base, scrollHeight: 900, clientHeight: 400, scrollTop: 80 })).toBe(false);
    expect(shouldLoadOlderHistory({ ...base, loading: true, scrollHeight: 900 })).toBe(false);
    expect(shouldLoadOlderHistory({ ...base, hasMore: false, scrollHeight: 900 })).toBe(false);
  });
});
