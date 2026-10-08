export type ApiErrorKind = "configuration" | "request" | "cancelled" | "timeout" | "network" | "http" | "api" | "invalid_response";

const HTTP_MESSAGES: Readonly<Record<number, string>> = {
  400: "The request was not accepted.",
  401: "Authentication is required for this request.",
  403: "This request is not allowed.",
  404: "The requested item was not found.",
  408: "The request timed out.",
  409: "The request conflicts with the current state.",
  413: "Profile picture is too large.",
  415: "This image format isn't supported.",
  429: "Too many requests. Try again shortly.",
};

/** An API error with stable, redacted user-facing details and no response-body data. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export function httpError(status: number): ApiError {
  const message = HTTP_MESSAGES[status]
    ?? (status >= 500 ? "The DevConnect service is temporarily unavailable." : "The request could not be completed.");
  return new ApiError("http", message, status);
}