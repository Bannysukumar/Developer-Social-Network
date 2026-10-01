# Architecture

## Application

The service is a Spring Boot process in `com.trivexa.socialnetwork`.

- `controller` maps `/api/v1` HTTP requests and returns `ApiResponse`.
- `service` applies business rules, privacy, and state transitions.
- `repository` is Spring Data MongoDB persistence.
- `entity` is the MongoDB document model.
- `dto` is the public request and response model.
- `security` authenticates JWTs, writes safe errors, and rate-limits selected routes.
- `websocket` authenticates `/ws/chat` and delivers ciphertext frames.
- `crypto` validates public-key length and ciphertext encoding. It does not encrypt messages.
- `notification` sends email when SMTP is configured, otherwise it records that delivery was skipped without logging the message body.
- `scheduler` deletes consumed one-time prekeys older than 30 days.

Controllers do not query MongoDB. Authorization is decided in services from the authenticated user id, not from a client-supplied sender id or role.

## Request path

1. `RequestIdFilter` assigns `X-Request-Id` and logs method, path, status, duration, and user id. It does not log query strings or bodies.
2. `RequestSizeFilter` rejects declared bodies larger than `app.security.max-request-bytes`.
3. Spring Security authenticates the bearer token, except for signup, login, refresh, forgot-password, reset-password, verify-email, Swagger, health, and the WebSocket handshake path.
4. `RateLimitFilter` applies fixed-window limits to signup, login, password reset, verification, search, friend requests, and message sends.
5. The controller validates the DTO and calls a service.

Unknown JSON properties are rejected. A client cannot add `roles`, `passwordHash`, or `plaintext` to a normal request.

## Database

MongoDB is the only database. Documents use string ids. Friendships are one document per pair, with the two user ids stored in sorted order and a unique index, so a duplicate one-to-one friendship is rejected by the database. Pending friend requests have a partial unique index on the sender and recipient. One-to-one conversations have a unique `participantKey`.

Multi-document changes use atomic `findAndModify` for the state transition, then a compensating unique insert. The project does not require a replica set. A replica set is still recommended in production if you later enable multi-document transactions. See [database.md](database.md).

## Authentication

1. Login checks the password with Argon2id. Missing users are checked against a dummy hash so the response does not take an obviously shorter path.
2. The API returns a JWT access token of about 15 minutes and an opaque `rt_` refresh token.
3. The refresh token hash, family id, and optional device id are stored. The raw refresh token is returned once.
4. `POST /api/v1/auth/refresh` atomically revokes the presented token and issues a new one in the same family.
5. Presenting a revoked refresh token revokes that family. Access tokens in the family stop working.
6. Logout revokes the presented refresh token and the current access token id.
7. Password change, password reset, and account deletion set `sessionValidAfter` and revoke refresh tokens.

Suspended and deleted users cannot authenticate. Roles are `USER`, `ADMIN`, and `MODERATOR`. Signup always stores `USER`. No API accepts a role from the client.

## WebSocket

`/ws/chat` requires a valid access token in the `Authorization` header or the `access_token` query parameter. Browser clients often cannot set the header, so the query parameter exists. Query strings are not written to the application log, and Tomcat access logs are disabled. Prefer the header for the VS Code extension and other native clients.

The server reads the sender id from the authenticated session. Clients may send `SEND`, `DELIVERED`, `READ`, and `PING`. The server persists ciphertext, pushes a `MESSAGE` frame, and emits delivery or read acknowledgements. On connect it sends `READY` and up to 20 pending messages. Clients should also reconcile with the REST cursor endpoint after reconnecting.

## End-to-end encryption boundary

The server is a ciphertext relay and a public-key directory. Encryption and decryption belong to the client. Details and limitations are in [e2ee.md](e2ee.md).

## Docker

Local Compose runs MongoDB on an internal network and publishes `127.0.0.1:27017` for the app running on the host. Production Compose does not publish MongoDB. The API is published on `127.0.0.1:8080` so aPanel, or the optional Nginx service, is the only public entry point.

```
Internet
  -> Nginx or aPanel :443
  -> Backend :8080
  -> MongoDB :27017
```

## Idempotency

- Sending the same pending friend request again returns the existing request.
- Creating the same one-to-one conversation again returns the existing conversation.
- A message with the same `clientMessageId` for the same sender and conversation returns the stored message.
- Marking a notification or message read is safe to retry.
- Blocking a user who is already blocked returns the current status.

General idempotency keys are not used beyond `clientMessageId`.

## Account deletion

`DELETE /api/v1/users/me` requires the current password. The account becomes `DELETED` and the username, email, display name, bio, and profile image are replaced with a tombstone. Refresh tokens, devices, public keys, friendships, pending requests, blocks, and the user's own notifications are removed or revoked. Shared conversations and ciphertext already stored for the other participant remain, with the sender profile showing as a deleted user. This is not a claim that plaintext already decrypted on another device is erased.
