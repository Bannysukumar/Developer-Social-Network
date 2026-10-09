import { z } from "zod";
import type { ApiConfig } from "./config";
import { ApiError, httpError } from "./errors";

const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
}).passthrough();

const envelopeSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  errorCode: z.string().optional(),
  details: z.array(z.unknown()).optional(),
});

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  readonly method?: ApiMethod;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly multipart?: {
    readonly filename: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
  };
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly binary?: boolean;
  readonly accessToken?: string | null;
  readonly skipAuth?: boolean;
}

export interface ApiClientOptions {
  readonly fetcher?: typeof fetch;
  readonly getAccessToken?: () => Promise<string | undefined>;
  readonly onUnauthorized?: () => Promise<string | undefined>;
  readonly onSessionRejected?: () => Promise<void>;
}

/** Centralized JSON transport with optional bearer authentication. */
export class ApiClient {
  private readonly fetcher: typeof fetch;
  private readonly getAccessToken?: () => Promise<string | undefined>;
  private readonly onUnauthorized?: () => Promise<string | undefined>;
  private readonly onSessionRejected?: () => Promise<void>;

  constructor(private readonly config: ApiConfig, options: ApiClientOptions = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.onSessionRejected = options.onSessionRejected;
  }

  async request<T>(path: string, dataSchema: z.ZodType<T>, options?: ApiRequestOptions): Promise<T>;
  async request(path: string, dataSchema?: undefined, options?: ApiRequestOptions): Promise<unknown>;
  async request<T>(
    path: string,
    dataSchema?: z.ZodType<T>,
    options: ApiRequestOptions = {},
  ): Promise<T | unknown> {
    return this.send(path, dataSchema, options, false);
  }

  private async send<T>(
    path: string,
    dataSchema: z.ZodType<T> | undefined,
    options: ApiRequestOptions,
    retried: boolean,
  ): Promise<T | unknown> {
    const url = this.createUrl(path, options.query);
    const method = options.method ?? "GET";
    let body: string | FormData | undefined;

    if (options.multipart && options.body !== undefined) {
      throw new ApiError("request", "The request could not be prepared.");
    }
    if (options.multipart) {
      const form = new FormData();
      const copy = new Uint8Array(options.multipart.bytes.byteLength);
      copy.set(options.multipart.bytes);
      form.append("file", new Blob([copy], { type: options.multipart.contentType }), options.multipart.filename);
      body = form;
    } else if (options.body !== undefined) {
      try {
        body = JSON.stringify(options.body);
      } catch {
        throw new ApiError("request", "The request could not be prepared.");
      }
      if (body === undefined) {
        throw new ApiError("request", "The request could not be prepared.");
      }
    }

    if (options.signal?.aborted) {
      throw new ApiError("cancelled", "The request was canceled.");
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (typeof body === "string") {
      headers["Content-Type"] = "application/json";
    }
    if (!options.skipAuth) {
      const token = options.accessToken === undefined
        ? await this.getAccessToken?.()
        : options.accessToken ?? undefined;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const abortForCaller = (): void => controller.abort("caller");
    options.signal?.addEventListener("abort", abortForCaller, { once: true });
    const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? this.config.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method,
          headers,
          body,
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          if (controller.signal.reason === "timeout") {
            throw new ApiError("timeout", "The DevConnect API request timed out.");
          }
          throw new ApiError("cancelled", "The request was canceled.");
        }
        throw new ApiError("network", "Could not reach the DevConnect API.");
      }

      if (response.status === 401 && !options.skipAuth) {
        if (!retried && this.onUnauthorized) {
          const refreshed = await this.onUnauthorized();
          if (refreshed) {
            return this.send(path, dataSchema, { ...options, accessToken: refreshed }, true);
          }
        }
        await this.onSessionRejected?.();
      }

      if (!response.ok) {
        throw await this.toHttpError(response);
      }
      if (options.binary) {
        return new Uint8Array(await response.arrayBuffer());
      }
      if (response.status === 204) {
        if (dataSchema) {
          throw new ApiError("invalid_response", "The DevConnect API returned an unexpected response.");
        }
        return undefined;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError("invalid_response", "The DevConnect API returned an unexpected response.");
      }

      const envelope = envelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new ApiError("invalid_response", "The DevConnect API returned an unexpected response.");
      }
      if (!envelope.data.success) {
        throw new ApiError("api", envelope.data.message || "The DevConnect API could not complete the request.", response.status);
      }
      if (!dataSchema) {
        return envelope.data.data;
      }

      const result = dataSchema.safeParse(envelope.data.data);
      if (!result.success) {
        throw new ApiError("invalid_response", "The DevConnect API returned an unexpected response.");
      }
      return result.data;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortForCaller);
    }
  }

  async bytes(path: string, options: ApiRequestOptions = {}): Promise<Uint8Array> {
    const data = await this.request(path, undefined, { ...options, binary: true, timeoutMs: options.timeoutMs ?? 60_000 });
    if (!(data instanceof Uint8Array)) {
      throw new ApiError("invalid_response", "The DevConnect API returned an unexpected response.");
    }
    return data;
  }

  private async toHttpError(response: Response): Promise<ApiError> {
    try {
      const payload: unknown = await response.json();
      const envelope = envelopeSchema.safeParse(payload);
      if (envelope.success && envelope.data.message) {
        return new ApiError("api", this.formatApiMessage(envelope.data.message, envelope.data.details), response.status);
      }
    } catch {
      // Fall through to status-based message.
    }
    return httpError(response.status);
  }

  private formatApiMessage(message: string, details: unknown[] | undefined): string {
    const messages = (details ?? [])
      .map((detail) => fieldErrorSchema.safeParse(detail))
      .flatMap((parsed) => (parsed.success && parsed.data.message ? [parsed.data.message] : []));
    const unique = [...new Set(messages)].slice(0, 3);
    if (unique.length === 0) return message;
    if (message === "Validation failed") return unique.join(" ");
    return `${message} ${unique.join(" ")}`;
  }

  private createUrl(
    path: string,
    query: ApiRequestOptions["query"],
  ): string {
    const segments = path.split("/");
    if (!path || path.startsWith("/") || path.includes("?") || path.includes("#")
      || path.includes("\\") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      throw new ApiError("request", "The API path is invalid.");
    }

    const url = new URL(`${this.config.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}
