# DevConnect VS Code Extension â€” Phase 2

## Goal
Build the isolated VS Code extension foundation without replacing or coupling it to the TanStack preview app.

## Deliverables
- Add a Manifest V3-compatible VS Code extension package with activation, Activity Bar view, and commands.
- Provide a local, theme-aware Webview shell with navigation and a restrictive nonce-based CSP.
- Add an allowlisted, schema-validated host/Webview message bridge; keep VS Code APIs and future secrets in the extension host.
- Add isolated build/typecheck/test/package scripts and focused tests for bridge validation and Webview security properties.
- Document the development and desktop VS Code validation steps, including capabilities still blocked by HTTP, undocumented WebSocket, and E2EE contracts.

## Boundaries
No backend/API calls, authentication, mock production content, localStorage-based secrets, WebSocket behavior, or cryptography. The Lovable browser preview remains unchanged and cannot verify Extension Host behavior or VSIX installation.

## Technical details
Keep all extension code/configuration under `extension/`. Use a strict TypeScript host entry point and a local Webview shell, a minimal versioned message protocol validated with Zod, and bundled local assets only. Use VS Code `SecretStorage` only in later authentication phases. Run isolated typecheck, lint, tests, build/package checks as available, plus the existing preview build check; report desktop-only checks as unverified rather than passed.
