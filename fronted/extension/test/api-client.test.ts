import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ApiClient } from "../src/api/client";
import { createApiConfig } from "../src/api/config";
import { ApiError } from "../src/api/errors";

const config = createApiConfig({ baseUrl: "https://api.example.test/api/v1", timeoutMs: 100 });
const userSchema = z.object({ id: z.string(), displayName: z.string() }).strict();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("central API client", () => {
  test("validates the success envelope and feature data", async () => {
    const client = new ApiClient(config, {
      fetcher: async () => jsonResponse({ success: true, message: "ok", data: { id: "u-1", displayName: "Dev" } }),
    });
    await expect(client.request("users/me", userSchema)).resolves.toEqual({ id: "u-1", displayName: "Dev" });
  });

  test("encodes query values and omits cookies by default", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const client = new ApiClient(config, {
      fetcher: async (input, init) => {
        receivedUrl = String(input);
        receivedInit = init;
        return jsonResponse({ success: true, message: "ok", data: [] });
      },
    });
    await client.request("users/search", z.array(z.unknown()), {
      query: { q: "Ada Lovelace", page: 0, size: 20, ignored: undefined },
    });
    expect(receivedUrl).toBe("https://api.example.test/api/v1/users/search?q=Ada+Lovelace&page=0&size=20");
    expect(receivedInit?.credentials).toBe("omit");
    expect(new Headers(receivedInit?.headers).has("Authorization")).toBe(false);
  });

  test("attaches bearer tokens and retries once after refresh", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    let refreshCount = 0;
    const client = new ApiClient(config, {
      getAccessToken: async () => "access-old",
      onUnauthorized: async () => {
        refreshCount += 1;
        return "access-new";
      },
      fetcher: async (input, init) => {
        const auth = new Headers(init?.headers).get("Authorization");
        calls.push({ url: String(input), auth });
        if (auth === "Bearer access-old") {
          return jsonResponse({ message: "expired" }, 401);
        }
        return jsonResponse({ success: true, message: "ok", data: { id: "u-1", displayName: "Dev" } });
      },
    });
    await expect(client.request("users/me", userSchema)).resolves.toEqual({ id: "u-1", displayName: "Dev" });
    expect(refreshCount).toBe(1);
    expect(calls).toEqual([
      { url: "https://api.example.test/api/v1/users/me", auth: "Bearer access-old" },
      { url: "https://api.example.test/api/v1/users/me", auth: "Bearer access-new" },
    ]);
  });

  test("surfaces API error messages without leaking raw secrets from other fields", async () => {
    const client = new ApiClient(config, {
      fetcher: async () => jsonResponse({
        success: false,
        message: "Invalid username or password",
        errorCode: "AUTHENTICATION_ERROR",
        details: ["Bearer secret-token"],
      }, 401),
    });
    const error = await client.request("auth/login", userSchema, { method: "POST", skipAuth: true })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "api", status: 401, message: "Invalid username or password" });
    expect((error as Error).message).not.toContain("secret-token");
  });

  test("shows field validation messages instead of a generic failure", async () => {
    const client = new ApiClient(config, {
      fetcher: async () => jsonResponse({
        success: false,
        message: "Validation failed",
        errorCode: "VALIDATION_ERROR",
        details: [{ field: "password", message: "Password must be 10-128 characters and include a letter and a digit" }],
      }, 400),
    });
    await expect(client.request("auth/signup", userSchema, { method: "POST", skipAuth: true })).rejects.toMatchObject({
      message: "Password must be 10-128 characters and include a letter and a digit",
    });
  });

  test("sends JSON bodies with explicit content type", async () => {
    let receivedInit: RequestInit | undefined;
    const client = new ApiClient(config, {
      fetcher: async (_input, init) => {
        receivedInit = init;
        return jsonResponse({ success: true, message: "ok", data: { id: "c-1", displayName: "Dev" } });
      },
    });
    await client.request("conversations", userSchema, {
      method: "POST",
      body: { participantId: "u-2" },
    });
    expect(receivedInit?.body).toBe('{"participantId":"u-2"}');
    expect(new Headers(receivedInit?.headers).get("Content-Type")).toBe("application/json");
  });

  test("rejects malformed envelopes and mismatched data schemas", async () => {
    const malformed = new ApiClient(config, {
      fetcher: async () => jsonResponse({ data: { id: "u-1" } }),
    });
    await expect(malformed.request("users/me", userSchema)).rejects.toMatchObject({ kind: "invalid_response" });

    const wrongData = new ApiClient(config, {
      fetcher: async () => jsonResponse({ success: true, message: "ok", data: { id: 3, displayName: false } }),
    });
    await expect(wrongData.request("users/me", userSchema)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  test("rejects invalid paths before making a request", async () => {
    let requests = 0;
    const client = new ApiClient(config, {
      fetcher: async () => {
        requests += 1;
        return jsonResponse({ success: true, message: "ok", data: {} });
      },
    });
    await expect(client.request("../users/me", userSchema)).rejects.toMatchObject({ kind: "request" });
    expect(requests).toBe(0);
  });

  test("returns a normalized timeout when the fetcher honors abort", async () => {
    const shortConfig = createApiConfig({ baseUrl: "https://api.example.test/api/v1", timeoutMs: 10 });
    const client = new ApiClient(shortConfig, {
      fetcher: (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("internal abort detail")), { once: true });
      }),
    });
    await expect(client.request("users/me", userSchema)).rejects.toMatchObject({
      kind: "timeout",
      message: "The DevConnect API request timed out.",
    });
  });
});
