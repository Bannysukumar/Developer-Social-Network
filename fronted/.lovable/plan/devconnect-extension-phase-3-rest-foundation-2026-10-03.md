# DevConnect Extension â€” Phase 3 REST Foundation

## Goal
Add a safe, centralized REST foundation inside the isolated VS Code extension package, without starting authentication or calling the live backend.

## Deliverables
- Define contract-derived API envelope, pagination, and feature DTO types in the shared extension package.
- Add validated API configuration, one centralized HTTP client, bounded timeouts, and normalized/redacted errors.
- Add focused tests for configuration, URL handling, response parsing, error normalization, and timeout behavior using injected fetch responses only.
- Update extension documentation with configuration and current transport limitations.

## Boundaries
- No login, signup, token storage, authenticated requests, user-facing API features, live backend traffic, WebSocket, or cryptography.
- Do not use the currently advertised HTTP endpoint for credentials or tokens; the API base URL must be configurable and no real credentials are introduced.
- Keep the TanStack preview app unchanged and all implementation under `extension/`.

## Validation
Install the extension package dependencies if absent, then run its typecheck, lint, tests, and bundle check, plus the existing preview build check. Report VSIX packaging and desktop VS Code behavior as unverified unless actually tested.
