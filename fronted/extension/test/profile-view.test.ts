import { describe, expect, test } from "bun:test";
import { profileActions } from "../src/shared/profile-view";

describe("profile privacy actions", () => {
  test("public profile with no relationship offers a request and block", () => {
    const view = profileActions({ accountType: "PUBLIC", relationship: "NONE", bio: "Builds tools" });
    expect(view.showRequest).toBe(true);
    expect(view.showMessage).toBe(false);
    expect(view.showBlock).toBe(true);
    expect(view.statusLine).toBe("Builds tools");
  });

  test("private profile hides social actions until friendship", () => {
    const view = profileActions({ accountType: "PRIVATE", relationship: "NONE", limited: true, bio: "Hidden" });
    expect(view.privateLocked).toBe(true);
    expect(view.showBio).toBe(false);
    expect(view.showMessage).toBe(false);
    expect(view.showRequest).toBe(true);
    expect(view.statusLine).toBe("This account is private.");
  });

  test("blocked profile offers only unblock", () => {
    const view = profileActions({ accountType: "PUBLIC", relationship: "BLOCKED", limited: true });
    expect(view.showUnblock).toBe(true);
    expect(view.showBlock).toBe(false);
    expect(view.showRequest).toBe(false);
    expect(view.showMessage).toBe(false);
    expect(view.statusLine).toBe("You blocked this account.");
  });

  test("friends can message", () => {
    const view = profileActions({ accountType: "PRIVATE", relationship: "FRIENDS", bio: "Hello" });
    expect(view.privateLocked).toBe(false);
    expect(view.showMessage).toBe(true);
    expect(view.showUnfriend).toBe(true);
    expect(view.statusLine).toBe("Hello");
  });

  test("pending request does not also offer add friend", () => {
    const view = profileActions({ accountType: "PUBLIC", relationship: "OUTGOING_REQUEST" });
    expect(view.requestSent).toBe(true);
    expect(view.showRequest).toBe(false);
  });
});
