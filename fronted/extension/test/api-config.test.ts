import { describe, expect, test } from "bun:test";
import { createApiConfig } from "../src/api/config";

describe("API configuration", () => {
  test("accepts and normalizes a configured HTTPS API base URL", () => {
    expect(createApiConfig({ baseUrl: "https://example.test/api/v1/" })).toEqual({
      baseUrl: "https://example.test/api/v1",
      timeoutMs: 15_000,
      allowInsecureHttp: false,
    });
  });

  test("allows HTTP for localhost and for remote hosts only when explicitly enabled", () => {
    expect(createApiConfig({ baseUrl: "http://localhost:8081/api/v1" }).baseUrl)
      .toBe("http://localhost:8081/api/v1");
    expect(() => createApiConfig({ baseUrl: "http://example.test/api/v1" })).toThrow("must use HTTPS");
    expect(createApiConfig({
      baseUrl: "http://185.216.203.209/api/v1",
      allowInsecureHttp: true,
    })).toEqual({
      baseUrl: "http://185.216.203.209/api/v1",
      timeoutMs: 15_000,
      allowInsecureHttp: true,
    });
  });

  test("rejects URLs with credentials, query strings, or the wrong API prefix", () => {
    expect(() => createApiConfig({ baseUrl: "https://user:pass@example.test/api/v1" })).toThrow();
    expect(() => createApiConfig({ baseUrl: "https://example.test/api/v1?token=x" })).toThrow();
    expect(() => createApiConfig({ baseUrl: "https://example.test" })).toThrow("end in /api/v1");
  });

  test("bounds request timeouts", () => {
    expect(() => createApiConfig({ baseUrl: "https://example.test/api/v1", timeoutMs: 60_001 })).toThrow();
    expect(() => createApiConfig({ baseUrl: "https://example.test/api/v1", timeoutMs: 0 })).toThrow();
  });
});
