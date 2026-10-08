# DevConnect for Visual Studio Code

Production-oriented VS Code extension for DevConnect: Activity Bar shell, authenticated REST client, SecretStorage sessions, discover/friends/messages/profile screens, and opaque ciphertext message relay against the hosted API.

## Backend

Default settings target the live deploy:

- API: `http://185.216.203.209/api/v1`
- Docs: [Swagger UI](http://185.216.203.209/swagger-ui/index.html)
- `devconnect.allowInsecureHttp` defaults to `true` for that HTTP endpoint

Prefer HTTPS when a verified TLS endpoint exists, then disable `allowInsecureHttp`.

## Screen flow

Opening the view shows a splash while the saved session is checked. A valid session opens Home. No session, or a rejected session, opens Login. Logged-out users cannot open Home, Search, Friends, Messages, Notifications, Profile, or Settings. Logged-in users are sent to Home if they open Login, Signup, Forgot password, or Reset password.

Logout clears SecretStorage tokens and in-memory social data, then returns to Login.

## Features

- Account: signup, login, logout, token refresh, SecretStorage session
- Profile: view/update profile, notifications
- Discover: user search, friend request, block
- Friends: incoming/outgoing requests, accept/reject, remove
- Messages: encrypted on the device with X25519 and AES-GCM after the friend's Ed25519 signed prekey is checked. The server stores ciphertext only. This is not the Signal protocol. A friend must publish keys before a message can be sent. One ciphertext is stored per message, for the friend's first verified device.

The live API is still `http://185.216.203.209`. Port 443 on that address presents a Let's Encrypt certificate for `angafunctionhall.com`, not for DevConnect. The extension will not trust that certificate or skip TLS checks. HTTPS starts only after a certificate is issued for an API hostname and the proxy is pointed at this API.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `devconnect.apiBaseUrl` | `http://185.216.203.209/api/v1` | REST base URL ending in `/api/v1` |
| `devconnect.allowInsecureHttp` | `true` | Allow remote `http://` |
| `devconnect.requestTimeoutMs` | `15000` | Request timeout |

## Build and check

```sh
npm install
npx bun@1.2.19 install
npx bun@1.2.19 run check
npx bun@1.2.19 run package
```

`package` creates a local `.vsix` under publisher `Bannysukumar2255`.

## Run in desktop VS Code

Open this `extension/` folder → install deps → F5 → open the DevConnect Activity Bar view → Account → sign in.

Do not push releases without an explicit request.
