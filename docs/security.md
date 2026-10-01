# Security

## Password hashing

Passwords are hashed with Spring Security's Argon2id encoder. Development and the framework default use 16-byte salt, 32-byte hash, parallelism 1, 16 MiB memory, and 2 iterations. Production raises memory to 64 MiB and iterations to 3. Tests use a lower cost so the suite can run. The test profile must not be used in production.

Passwords must be 10 to 128 characters, contain a letter and a digit, contain no whitespace, and not include the username or email local part. A small denylist rejects a few common values. This is a policy check, not a substitute for a breached-password service.

## JWT and refresh tokens

Access tokens are HMAC-SHA256 JWTs. The secret comes from `JWT_SECRET` and must be at least 32 bytes. Production refuses example secrets. Claims include the user id, username, roles, a token id, a refresh family id, issuer, audience, and `typ=access`.

Refresh tokens are random 32-byte values with an `rt_` prefix. Only their SHA-256 hash is stored. Rotation is atomic. Reuse of a revoked token revokes the token family. Logout also stores the access token id until it expires. Expired revocation records are removed by MongoDB TTL indexes.

Tokens, passwords, and reset secrets are not written to application logs.

## CORS and headers

`CORS_ALLOWED_ORIGINS` is an explicit list. `*` is rejected. Credentials are allowed only for those origins. Production enables HSTS. Responses include `X-Content-Type-Options`, `X-Frame-Options: DENY`, a restrictive content security policy, and `Referrer-Policy: no-referrer`. The server header is blank. Stack traces and MongoDB errors are not returned to clients.

## Rate limiting

The default store is in-memory and is per process. Use `RATE_LIMIT_STORE=redis` and `REDIS_URL` when more than one API instance is running. Redis is optional and is not required for local development. If Redis is selected and cannot be reached, the limited routes fail closed with HTTP 503.

Default limits:

| Route | Limit |
| --- | --- |
| Signup | 5 per hour per IP |
| Login | 10 per 15 minutes per IP |
| Forgot password, reset, verify email | 5 or 10 per hour per IP |
| Resend verification | 5 per hour per user |
| Search | 30 per minute per user |
| Friend request | 20 per hour per user |
| Message send | 60 per minute per user |

`TRUST_PROXY` must be true only when the API is reachable solely through the reverse proxy. Otherwise clients can spoof `X-Forwarded-For`.

## Authorization

Every conversation, message, notification, device, and friend-request mutation checks the authenticated user. A caller who is not a participant receives 404 for conversations and messages so resource ids are not confirmed. Friend-request accept and reject require the recipient. Delete-for-everyone requires the sender. Read and delivery acknowledgements require the recipient.

Private profiles hide bio and join date from non-friends. Blocks are enforced in both directions for profiles, search, friend requests, conversations, messages, and key bundles. Blocking also removes the friendship and cancels pending requests.

## WebSocket

The handshake authenticates the access token before the socket is established. Invalid tokens are rejected. The sender id in a frame is ignored. Membership and block checks run again when a message is stored.

## Account enumeration

Forgot-password returns the same success message whether or not the email exists. Signup uses one duplicate message for username and email collisions. Login uses one failure message for an unknown user and a wrong password. A correct password on a suspended or deleted account returns a distinct inactive-account error.

## Secrets

Real secrets belong in the environment or a secret manager. `.env.example` contains placeholders. Production profile startup fails when the JWT secret is missing, short, or an example value, when CORS is empty or `*`, or when `MONGODB_URI` has no credentials.

## Logging and audit

Request logs include the request id, method, path, status, duration, and user id. Audit records cover login, logout, password changes, password resets, email verification, device changes, account deletion, and block changes. Audit metadata drops fields whose names look like passwords, tokens, secrets, or ciphertext.

## Actuator

`/actuator/health` is public and does not show details. Other management endpoints are not exposed. Readiness includes MongoDB and the rate-limit store.

## Backups

Backup commands are documented in [backups.md](backups.md). Nothing in this repository schedules them.
