# DevConnect â€” Phase 1 Architecture and API Contract

Contract checked against the live OpenAPI document at `http://185.216.203.209/v3/api-docs` on 2026-10-01. This is an architecture and discovery record only; it does not implement the extension or call authenticated endpoints.

## Repository fit

The repository is currently a TanStack Start web app with a placeholder `/` page. It has no VS Code extension manifest, extension-host entry point, Webview provider, or VS Code API dependency. The requested deliverable is an installable VS Code extension, so keep it in an isolated `extension/` package instead of replacing the current app bootstrap. The Lovable browser preview cannot host VS Code's Extension Host, Webview APIs, or `SecretStorage`; extension behavior and VSIX installation require desktop VS Code.

## API contract findings

- OpenAPI 3.1, title **DevConnect Social Network API**, version `v1`; server URL `http://185.216.203.209`.
- API prefix: `/api/v1`.
- Bearer JWT is the global security scheme. Only operations explicitly marked `security: []` in the spec are public: login, signup, refresh, forgot password, reset password, and email verification. Other operations inherit bearer auth, including logout and resend/change password.
- Successful responses use `ApiResponse<T>` with `success`, `message`, and `data` fields.
- The spec does not define a common API error schema. A 401 observed on `/api-docs` returned `message`, `errorCode`, `timestamp`, and `path`; this does not establish the error contract for `/api/v1` endpoints.
- Auth responses include `tokenType`, `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, and a user profile. Refresh accepts a `refreshToken` and returns a new auth response.
- Collection pages use `{ items, page, size, totalElements, totalPages, hasNext }`. Message history uses `{ items, nextCursor, hasNext }` and returns newest-first ciphertext messages.
- No WebSocket path, handshake, auth mechanism, event schema, heartbeat, or reconnect contract is in the OpenAPI document. `/ws/chat` appears only as an example in the uploaded brief and is unverified.
- The spec says message bodies are client-encrypted ciphertext, the server stores/forwards ciphertext and public key material, and private keys are never accepted. It does not identify an E2EE protocol, compatible client library, or key lifecycle contract.
- The advertised backend uses HTTP. Do not use it for production credentials or tokens. Production authentication requires a configured HTTPS endpoint; any future real-time transport requires WSS. CORS behavior and production TLS readiness are unverified.

## Confirmed operation map

All paths below are relative to `/api/v1`. Except the public auth operations listed above, the operations inherit global JWT bearer authentication.

| Area | Method and path | Contract notes |
|---|---|---|
| Authentication | `POST /auth/signup` | Public; JSON `SignupRequest`: required `username`, `email`, `password`, `displayName`; returns auth response. |
| Authentication | `POST /auth/login` | Public; JSON `LoginRequest`: required `usernameOrEmail`, `password`, optional `device` (`deviceId`, `deviceName`, `platform`); returns auth response. |
| Authentication | `POST /auth/refresh` | Public; JSON `{ refreshToken }`; rotates tokens and returns auth response. |
| Authentication | `POST /auth/logout` | Bearer; JSON `{ refreshToken }`; revokes the presented refresh token and current access token. |
| Authentication | `POST /auth/forgot-password` | Public; JSON `{ email }`; documented to avoid revealing whether the email exists. |
| Authentication | `POST /auth/reset-password` | Public; JSON `{ token, newPassword }`. |
| Authentication | `POST /auth/verify-email` | Public; JSON `{ token }`. |
| Authentication | `POST /auth/change-password` | Bearer; JSON `{ currentPassword, newPassword }`; revokes existing sessions. |
| Authentication | `POST /auth/resend-verification` | Bearer; no body. |
| Users | `GET /users/me` | Bearer; authenticated profile. |
| Users | `PATCH /users/me` | Bearer; JSON `UpdateProfileRequest`; optional `displayName`, `bio`, `accountType`, `clearProfileImage`. |
| Users | `PUT /users/me` | Bearer; JSON `ReplaceProfileRequest`; required `displayName`, `accountType`, optional `bio`, `clearProfileImage`. |
| Users | `DELETE /users/me` | Bearer; JSON `DeleteAccountRequest`; anonymizes and deactivates the account. |
| Users | `GET /users/{userId}` | Bearer; profile visible under caller's access rules. |
| Users | `GET /users/search?q&page&size` | Bearer; searches username/display name; page starts at 0; size 1â€“20 (default 20, page max 1000); returns user summary page. |
| Users | `POST /users/{userId}/block` | Bearer; blocks the user. |
| Users | `DELETE /users/{userId}/block` | Bearer; removes a block made by caller. |
| Users | `GET /users/{userId}/block-status` | Bearer; returns `blockedByMe`, `blockedMe`. |
| Users | `POST /users/me/avatar` | Bearer; multipart field `file`; JPEG, PNG, or WebP. |
| Media | `GET /media/{fileId}` | Bearer; downloads a profile image the caller may access. |
| Friends | `GET /friends?page&size` | Bearer; accepted friends; page 0â€“1000, size 1â€“50 (default 20). |
| Friends | `DELETE /friends/{userId}` | Bearer; removes friendship. |
| Friend requests | `GET /friend-requests/incoming?page&size` | Bearer; incoming pending requests; page 0â€“1000, size 1â€“50 (default 20). |
| Friend requests | `GET /friend-requests/outgoing?page&size` | Bearer; outgoing pending requests; page 0â€“1000, size 1â€“50 (default 20). |
| Friend requests | `POST /friend-requests/{userId}` | Bearer; sends request to user ID. |
| Friend requests | `POST /friend-requests/{requestId}/accept` | Bearer; accepts request addressed to caller. |
| Friend requests | `POST /friend-requests/{requestId}/reject` | Bearer; rejects request addressed to caller. |
| Friend requests | `DELETE /friend-requests/{requestId}` | Bearer; cancels request sent by caller. |
| Notifications | `GET /notifications?page&size` | Bearer; page 0â€“1000, size 1â€“50 (default 20); returns a notification page and unread count. |
| Notifications | `POST /notifications/{notificationId}/read` | Bearer; marks one notification read. |
| Notifications | `POST /notifications/read-all` | Bearer; marks every unread notification read. |
| Devices | `GET /devices?includeRevoked` | Bearer; lists caller's devices; `includeRevoked` is optional. |
| Devices | `DELETE /devices/{deviceId}` | Bearer; revokes device, public keys, and refresh tokens. |
| Keys | `POST /keys/identity` | Bearer; registers public identity key; required `algorithm`, `deviceName`, `platform`, `publicKey`; algorithms `Ed25519` or `X25519`. |
| Keys | `POST /keys/prekeys` | Bearer; required `deviceId`; optional signed prekey and up to 100 one-time prekeys. |
| Keys | `GET /keys/{userId}` | Bearer; retrieves public key bundles for a friend; one-time prekeys are consumed. |
| Keys | `DELETE /keys/devices/{deviceId}` | Bearer; revokes device and deletes its public key material. |
| Conversations | `GET /conversations?page&size` | Bearer; page 0â€“1000, size 1â€“50 (default 20). |
| Conversations | `POST /conversations` | Bearer; JSON `{ participantId }`; creates or returns one-to-one conversation with a friend. |
| Conversations | `GET /conversations/{conversationId}` | Bearer; reads a conversation caller belongs to. |
| Messages | `GET /conversations/{conversationId}/messages?cursor&limit` | Bearer; newest first; cursor optional, limit 1â€“50 (default 30); returns ciphertext page. |
| Messages | `POST /conversations/{conversationId}/messages` | Bearer; JSON requires `ciphertext`; optional `messageType`, `clientMessageId`, `deviceId`, `keyId`. |
| Messages | `PATCH /messages/{messageId}/read` | Bearer; marks a message read as recipient. |
| Messages | `DELETE /messages/{messageId}?scope` | Bearer; hides for caller, or clears server ciphertext for everyone when scope is `everyone`. |

`UserProfileResponse` includes `id`, `username`, `displayName`, `bio`, `profileImageUrl`, `accountType`, `status`, `emailVerified`, `email`, `roles`, `relationship`, `createdAt`, and `limited`. User summary DTOs are narrower. `MessageResponse` contains `ciphertext` plus message/conversation IDs, sender/recipient IDs, type, status, device/key IDs, timestamps, and deletion state; it does not promise a plaintext preview.

## Proposed extension architecture

```text
VS Code Extension Host
  â”œâ”€ activation, commands, Activity Bar view, Webview provider
  â”œâ”€ SecretStorage and session/API coordinator
  â”œâ”€ allowlisted, schema-validated Webview message bridge
  â””â”€ centralized REST client and typed service layer
       â””â”€â”€ React + TypeScript Webview
             â”œâ”€ responsive screens and feature state
             â”œâ”€ VS Code theme-variable styling
             â””â”€ no direct arbitrary Node.js or VS Code API access
```

Suggested isolated package shape: `extension/package.json` (manifest and commands), `extension/src/extension/` (activation, views, storage, bridge), `extension/src/webview/` (React UI), `extension/src/shared/` (DTOs), `extension/src/api/` (central client/services), and `extension/test/` (host, Webview, API contract tests). Use strict TypeScript, keep service calls out of UI components, and avoid installing extension-only build changes into the current preview app.

### Security requirements

- Use VS Code `SecretStorage` for refresh credentials and any approved private key material; do not use Webview `localStorage` for tokens or private keys.
- Keep Webview-to-host messages typed, schema-validated, allowlisted, and least-privilege; never expose arbitrary command execution or Node APIs.
- Use a nonce-based restrictive CSP, local packaged resources, safe text rendering, and no CDN scripts or `unsafe-inline`.
- Redact tokens, plaintext messages, and private keys from logs. Bound request timeouts and retries; refresh at most once and retry the original request at most once.
- Treat HTTP as non-production only. Require HTTPS/WSS before any production authentication or real-time transport.
- Do not claim E2EE or show a secure-session indicator until an established protocol, key lifecycle, backend compatibility, and implementation are verified. The current API contract is insufficient to choose or claim one.

## State and integration flow

The extension host owns session lifecycle and token storage. Login/signup response tokens remain in the host; protected requests attach access JWTs in the centralized API layer. An eligible expired-token response may trigger one refresh rotation; retry the original request once, then clear session on refresh failure. The UI accesses operations only through the validated bridge. Backend DTOs remain separate from UI display state. Cache message ciphertext only ephemerally until an approved crypto implementation exists. Do not surface live connection status until a backend WebSocket contract is documented and tested.

## Phased implementation order

1. Architecture and API contract (this record; no feature logic).
2. VS Code extension foundation: manifest, Activity Bar, Webview shell, theme adaptation, navigation, validated bridge.
3. REST foundation: config, types, centralized client, normalized errors, timeout and contract tests.
4. Authentication and host SecretStorage (secure release gated on HTTPS).
5. Profiles, user search, and privacy.
6. Friend requests, friends, blocking, notifications.
7. Conversation and ciphertext history UI.
8. WebSocket only after the real backend protocol is supplied and verified.
9. E2EE only after selecting a compatible established protocol and proving backend/client compatibility.
10. Settings and device management using confirmed endpoints.
11â€“14. Tests, performance/security hardening, VSIX packaging/installation, production-readiness verification.

After each implementation phase, report real build, lint, typecheck, test, package, API, WebSocket, and E2EE results; do not claim untested features work.

## Explicit blockers before dependent phases

1. Backend owner must provide the actual WebSocket URL, handshake/auth flow, event/payload schemas, heartbeat, and reconnect expectations before real-time implementation.
2. Backend owner must provide E2EE protocol and key/session compatibility details before production encryption or a verified-encryption claim.
3. Production deployment needs HTTPS and WSS plus verified CORS/network accessibility. The currently advertised server is HTTP.
4. VSIX install and Extension Host/Webview behavior need desktop VS Code; the Lovable preview cannot verify them.