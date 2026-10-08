# DevConnect VS Code Extension â€” Phase 1

## Goal

Produce an installable DevConnect VS Code extension that consumes the existing Java backend. Do not create a second backend, database, mock production data, or invent undocumented API behavior.

## Current project and constraints

- The repository currently contains a TanStack Start web app with a placeholder home page; it has no VS Code extension manifest or extension-host source. The requested deliverable therefore needs a distinct extension package, not a browser-only replacement.
- The running preview cannot provide VS Code's Extension Host, Webview APIs, or SecretStorage. Extension behavior and installation must be validated in desktop VS Code; the Lovable preview is not the extension runtime.
- The live OpenAPI document is reachable at `http://185.216.203.209/v3/api-docs` (OpenAPI 3.1, API v1). It declares global JWT bearer authentication, except for explicitly public auth operations.
- The backend currently advertises plain HTTP. Never send production credentials or tokens over HTTP; production use requires HTTPS and WSS.
- Swagger contains no WebSocket route, handshake, event schema, or connection/auth instructions. The `/ws/chat` example in the brief is not confirmed by the API contract. Real-time messaging must wait for backend documentation or an observed, user-approved contract.
- Swagger describes message bodies as client-encrypted ciphertext and says private keys are never accepted. It does not specify an E2EE protocol or client implementation. Do not invent cryptography or show a verified-encryption indicator without a compatible, verified protocol.

## Proposed architecture

```text
VS Code Extension Host
  â”œâ”€ commands, Activity Bar view, Webview provider
  â”œâ”€ SecretStorage for refresh credentials and private key material
  â”œâ”€ narrow, validated message bridge (no arbitrary command execution)
  â””â”€ API/session coordinator
       â”œâ”€ centralized REST client and typed services
       â””â”€ future WebSocket adapter (contract pending)
             â”‚
             â””â”€â”€ React + TypeScript Webview
                   navigation, accessible UI, theme-variable styling,
                   feature state, and typed requests via the bridge
```

Keep the extension host as the authority for secrets and VS Code APIs. The Webview receives only the minimum session-derived data needed to render; do not persist tokens in browser storage. Apply a strict nonce-based CSP, local bundled resources, message validation, bounded request timeouts, normalized errors, and redaction of tokens, plaintext, and key material from logs.

### Suggested extension package layout

```text
extension/
  package.json                 # VS Code manifest, commands, Activity Bar contribution
  tsconfig.json
  vite.config.ts               # bundled React Webview assets
  src/extension/               # activation, commands, view provider, storage, bridge
  src/webview/                 # React entry, views, components, stores, theme styles
  src/shared/                  # bridge DTOs and backend contract types
  src/api/                     # config, HTTP client, auth and domain services
  test/                        # host, API contract, and Webview tests
```

Use the current repository only as the host workspace for this package; do not replace its TanStack bootstrap with a VS Code-only runtime. Keep extension build and packaging commands isolated so the unrelated preview app is not mistaken for an installable extension.

## Confirmed API mapping

All paths below are under `/api/v1`. Response success bodies use `ApiResponse<T>` (`success`, `message`, `data`). The API spec does not define a general error schema; a separate unauthenticated 401 probe returned `message`, `errorCode`, `timestamp`, and `path`, which is observed behavior, not a guaranteed contract.

| Capability | Confirmed operations and contract |
|---|---|
| Authentication | `POST /auth/signup`, `/auth/login`, `/auth/refresh` are public and return `ApiResponse<AuthResponse>`; `/auth/logout`, `/auth/change-password`, `/auth/resend-verification` require bearer auth. `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` are public. Login accepts `usernameOrEmail`, `password`, optional device context. Signup requires `username`, `email`, `password`, `displayName`. Auth response contains access/refresh tokens, expiry timestamps, and user. Refresh accepts a refresh token and rotates tokens. |
| Profile and user discovery | `GET/PATCH/PUT/DELETE /users/me`; `GET /users/{userId}`; `GET /users/search?q&page&size`; `POST /users/me/avatar` (multipart `file`); `POST/DELETE /users/{userId}/block`; `GET /users/{userId}/block-status`. Search returns a page of user summaries. |
| Friends | `GET /friends?page&size`, `DELETE /friends/{userId}`; incoming/outgoing pages at `GET /friend-requests/incoming` and `/outgoing`; `POST /friend-requests/{userId}`; accept/reject by request ID; cancel with `DELETE /friend-requests/{requestId}`. |
| Notifications | `GET /notifications?page&size` (page plus unread count); `POST /notifications/{notificationId}/read`; `POST /notifications/read-all`. |
| Conversations and messages | `GET/POST /conversations` (page/size; create requires `participantId`); `GET /conversations/{conversationId}`; `GET/POST /conversations/{conversationId}/messages` (cursor/limit; send requires `ciphertext`); `PATCH /messages/{messageId}/read`; `DELETE /messages/{messageId}?scope=...`. Message response includes ciphertext and metadata, not a plaintext preview. |
| Devices and public keys | `GET /devices?includeRevoked=...`; `DELETE /devices/{deviceId}`; `DELETE /keys/devices/{deviceId}`; `POST /keys/identity`; `POST /keys/prekeys`; `GET /keys/{userId}` returns public key bundles. The API accepts public key material, not private keys. |
| WebSocket | No endpoint or protocol is documented in OpenAPI; no implementation contract can be mapped yet. |

Pagination is page/size for collection resources (the spec sets limits for relevant endpoints) and cursor/limit for message history. Contract-specific DTOs should be transcribed from OpenAPI, not UI guesses.

## State and flow decisions

- Keep session lifecycle in one auth store/coordinator; keep backend DTOs separate from display models.
- Login/signup return tokens to the extension host for SecretStorage. Attach access JWT to protected requests; refresh once on an eligible expiry response, retry the original request once, and clear the session if rotation fails. Do not log token material.
- Route every Webview API request through a small allowlisted bridge with schema-validated inputs and outputs. Components do not call `fetch` or VS Code APIs directly.
- Use cancellable/bounded REST calls and the contract's pagination. Keep message cache ephemeral and ciphertext-only until a supported E2EE client is established.
- Expose connection state only after a real WebSocket contract is supplied. Do not simulate live messages or connection indicators.

## Security and E2EE plan

- Require HTTPS for production API traffic and WSS for real-time traffic. The current HTTP server is suitable only for contract inspection; authentication integration remains blocked for a secure release until HTTPS is available.
- Use VS Code SecretStorage for long-lived secrets, least-privilege bridge messages, strict Webview CSP with nonce, local assets, input validation, safe text rendering, and privacy-preserving logs.
- First isolate crypto behind a host/Webview-safe interface. Select an established audited protocol/library only after backend compatibility, key lifecycle, device semantics, and supported runtime are confirmed. Until then, E2EE is not implemented and the UI must not claim it is.

## Phases

1. **Architecture and contract record** â€” document the repository fit, confirmed API mapping, unresolved WebSocket/E2EE details, security gates, and test/packaging approach. No application logic or feature UI.
2. **VS Code foundation** â€” extension manifest, activation, Activity Bar entry, secure Webview shell, theme adaptation, navigation, and validated bridge.
3. **REST foundation** â€” centralized configuration/client, contract types, error handling, timeouts, and tests.
4. **Authentication** â€” signup/login/logout/refresh and host SecretStorage, subject to HTTPS for secure release.
5â€“6. **Profiles and social** â€” search, profile, privacy, friend workflows, blocking, and notifications.
7â€“8. **Messaging** â€” conversation/history UI first; WebSocket only after the actual backend protocol is documented and verified.
9. **E2EE** â€” only with a compatible established protocol and testable server/client contract.
10. **Settings and devices** â€” account, privacy, security, device management, and settings supported by confirmed endpoints.
11â€“14. **Quality and release** â€” tests, performance/security review, VSIX packaging/installation, and production readiness. Report actual pass/fail results; do not claim untested capabilities.

## Phase 1 deliverable and acceptance

Create a concise architecture/API-contract record only. No app UI, backend, database, mock data, API client, or authentication code in this phase. Acceptance requires the API mappings above to match the fetched OpenAPI contract, unknown WebSocket/E2EE contracts to remain explicit blockers, and the extension-versus-preview limitation to be clear before implementation phases begin.