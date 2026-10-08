import { z } from "zod";

const configInputSchema = z.object({
  baseUrl: z.string().trim().url(),
  timeoutMs: z.number().int().min(1).max(60_000).default(15_000),
  allowInsecureHttp: z.boolean().default(false),
}).strict();

export interface ApiConfig {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly allowInsecureHttp: boolean;
}

/** Validate an API URL. Remote HTTP requires an explicit allowInsecureHttp flag. */
export function createApiConfig(input: unknown): ApiConfig {
  const parsed = configInputSchema.parse(input);
  const url = new URL(parsed.baseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isLocalHttp = url.protocol === "http:" && localHosts.has(url.hostname);
  const isRemoteHttp = url.protocol === "http:" && !isLocalHttp;

  if (url.protocol !== "https:" && !isLocalHttp && !(isRemoteHttp && parsed.allowInsecureHttp)) {
    throw new Error(
      "DevConnect API must use HTTPS (HTTP is allowed for localhost, or for a remote host when allowInsecureHttp is enabled).",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("DevConnect API URL must not contain credentials, a query, or a fragment.");
  }
  if (!url.pathname.replace(/\/$/, "").endsWith("/api/v1")) {
    throw new Error("DevConnect API URL must end in /api/v1.");
  }

  return Object.freeze({
    baseUrl: url.toString().replace(/\/$/, ""),
    timeoutMs: parsed.timeoutMs,
    allowInsecureHttp: parsed.allowInsecureHttp,
  });
}
