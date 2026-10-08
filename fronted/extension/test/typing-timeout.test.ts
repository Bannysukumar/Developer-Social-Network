import { expect, test } from "bun:test";
import type { AuthService } from "../src/extension/auth-service";
import { SessionFlow } from "../src/extension/session-flow";

function auth(): AuthService {
  return {
    apiConfig: { allowInsecureHttp: false, baseUrl: "https://example.test/api/v1" },
    isAuthenticated: () => true,
    hasDeviceKeys: () => false,
    getUser: () => ({ id: "me" }),
  } as AuthService;
}

test("a lost typing stop clears the indicator", async () => {
  const flow = new SessionFlow(auth(), () => {});
  flow.ingestFrame({ type: "TYPING_START", data: { conversationId: "c1", userId: "them" } });
  expect(flow.snapshot().typing).toEqual({ conversationId: "c1", userId: "them" });
  await new Promise((resolve) => setTimeout(resolve, 4200));
  expect(flow.snapshot().typing).toBeNull();
});
