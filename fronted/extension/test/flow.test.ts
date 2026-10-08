import { describe, expect, test } from "bun:test";
import { notificationDestination, resolveScreen } from "../src/shared/flow";

describe("authentication screen guard", () => {
  test("keeps splash while the session is being checked", () => {
    expect(resolveScreen({ requested: "home", authenticated: true, checking: true })).toBe("splash");
    expect(resolveScreen({ requested: "login", authenticated: false, checking: true })).toBe("splash");
  });

  test("sends logged-out users away from protected screens", () => {
    for (const screen of ["home", "search", "user", "friends", "messages", "notifications", "profile", "settings"] as const) {
      expect(resolveScreen({ requested: screen, authenticated: false, checking: false })).toBe("login");
    }
  });

  test("sends logged-in users away from auth screens", () => {
    for (const screen of ["login", "signup", "forgot", "reset"] as const) {
      expect(resolveScreen({ requested: screen, authenticated: true, checking: false })).toBe("home");
    }
  });

  test("keeps the requested screen when access matches the session", () => {
    expect(resolveScreen({ requested: "search", authenticated: true, checking: false })).toBe("search");
    expect(resolveScreen({ requested: "forgot", authenticated: false, checking: false })).toBe("forgot");
  });

  test("routes notifications to the related screen", () => {
    expect(notificationDestination("FRIEND_REQUEST")).toBe("friends");
    expect(notificationDestination("NEW_MESSAGE")).toBe("messages");
    expect(notificationDestination("SECURITY")).toBe("settings");
  });
});
